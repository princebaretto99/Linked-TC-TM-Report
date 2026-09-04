/**
 * Thin client for the BrowserStack Test Management REST API (v2).
 * Docs: https://www.browserstack.com/docs/test-management/api-reference/introduction
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://test-management.browserstack.com/api/v2';
const PAGE_SIZE = 300;   // API accepts ONLY 30 or 300 — not an arbitrary value in that range
const MAX_PAGES = 100;   // runaway guard

/** Minimal .env reader — avoids a dependency on dotenv. */
function loadDotEnv(cwd = process.cwd()) {
  const file = path.join(cwd, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue; // real env wins
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
}

export class ApiError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class TestManagementClient {
  constructor({ username, accessKey } = {}) {
    loadDotEnv();
    const user = username ?? process.env.BROWSERSTACK_USERNAME;
    const key = accessKey ?? process.env.BROWSERSTACK_ACCESS_KEY;
    if (!user || !key) {
      throw new ApiError(
        'Missing BrowserStack credentials.\n\n' +
        '  cp .env.example .env    then fill in BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY\n' +
        '  (or export them as environment variables)\n\n' +
        'Get them from https://www.browserstack.com/accounts/profile/details'
      );
    }
    this.auth = 'Basic ' + Buffer.from(`${user}:${key}`).toString('base64');
    /** projectId → run ids found by probing but never returned by the list endpoint. */
    this.discoveredRuns = new Map();
    /** Projects whose identifier range has already been swept once. */
    this.sweptProjects = new Set();
  }

  async request(pathname, { searchParams = {} } = {}) {
    const url = new URL(BASE_URL + pathname);
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: this.auth, Accept: 'application/json' },
      });
    } catch (cause) {
      throw new ApiError(`Network error calling ${url.pathname}: ${cause.message}`, { url: url.href });
    }

    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    if (!response.ok) {
      throw new ApiError(explainHttpError(response.status, url, body), {
        status: response.status, url: url.href, body,
      });
    }
    return body;
  }

  /** Follows `p=1,2,...` until `info.next` is null, concatenating `body[collectionKey]`. */
  async getAllPages(pathname, collectionKey, searchParams = {}) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await this.request(pathname, {
        searchParams: { ...searchParams, p: page, page_size: PAGE_SIZE },
      });
      const batch = body?.[collectionKey];
      if (!Array.isArray(batch)) {
        // Some endpoints hyphenate the key (e.g. "test-results"); try the sibling spelling.
        const alt = body?.[collectionKey.replace(/_/g, '-')] ?? body?.[collectionKey.replace(/-/g, '_')];
        if (!Array.isArray(alt)) break;
        items.push(...alt);
        if (!body?.info?.next) break;
        continue;
      }
      items.push(...batch);
      if (batch.length === 0 || !body?.info?.next) break;
    }
    return items;
  }

  listProjects() {
    return this.getAllPages('/projects', 'projects');
  }

  getProject(projectId) {
    return this.request(`/projects/${encodeURIComponent(projectId)}`);
  }

  listTestRuns(projectId) {
    return this.getAllPages(
      `/projects/${encodeURIComponent(projectId)}/test-runs`,
      'test_runs',
      { include_closed: true },
    );
  }

  async getTestRun(projectId, runId) {
    const body = await this.request(
      `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}`,
    );
    // Unwrap and guarantee the identifier, which the detail payload sometimes omits.
    const run = body?.test_run ?? body ?? {};
    return { identifier: runId, ...run };
  }

  /** Returns the run record, or null if it does not exist in this project. */
  async findTestRun(projectId, runId) {
    try {
      return await this.getTestRun(projectId, runId);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  /**
   * The list endpoint hides re-runs. Measured against PR-155: `GET /test-runs` returned 42 runs
   * (and `count: 42`) while 62 actually exist — for every build that ran more than once it
   * returns only the FIRST run and omits the rest. Build #36 listed TR-1182 and hid TR-1184,
   * 1185, 1186 and 1188; build #40 listed TR-1194 and hid TR-1195, the re-run that fixed it.
   * No filter combination surfaces them (`created_after`, `run_state`, `include_closed` were all
   * tried); `GET /test-runs/{id}` returns each one fine.
   *
   * Since a build's status is the union of all its runs, those hidden runs are exactly the ones
   * that matter — omitting them reports a build as broken after a re-run has already fixed it.
   * So the listing is treated as incomplete and the identifier space is probed directly.
   *
   * The first call for a project sweeps the whole range (min listed id → max + probeAhead).
   * That costs a burst of cheap 404s once; results are remembered for the life of the process,
   * and later calls only re-check the remembered ids plus a recent window.
   */
  async listTestRunsIncludingUnindexed(projectId, { probeAhead = 12, lookBehind = 40 } = {}) {
    const runs = await this.listTestRuns(projectId);
    const known = new Set(runs.map((run) => run.identifier));

    const numbers = runs
      .map((run) => Number(String(run.identifier).replace(/\D/g, '')))
      .filter(Number.isFinite);
    if (numbers.length === 0) return { runs, unindexed: [] };

    const highest = Math.max(...numbers);
    const swept = this.sweptProjects.has(projectId);
    // First time: sweep everything. Afterwards: a recent window is enough, since anything
    // older was already found and is remembered.
    const from = swept ? Math.max(1, highest - lookBehind) : Math.min(...numbers);

    const candidates = new Set(this.discoveredRuns.get(projectId) ?? []);
    for (let n = from; n <= highest + probeAhead; n++) candidates.add(`TR-${n}`);
    for (const id of known) candidates.delete(id);

    const found = await this.#probeRuns(projectId, [...candidates]);
    this.sweptProjects.add(projectId);

    const store = this.discoveredRuns.get(projectId) ?? new Set();
    for (const run of found) store.add(run.identifier);
    this.discoveredRuns.set(projectId, store);

    return { runs: [...runs, ...found], unindexed: found.map((run) => run.identifier) };
  }

  /** Batched so a full sweep does not fire a hundred simultaneous requests. */
  async #probeRuns(projectId, ids, batchSize = 12) {
    const found = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = await Promise.all(
        ids.slice(i, i + batchSize).map((id) => this.findTestRun(projectId, id)));
      found.push(...batch.filter(Boolean));
    }
    return found;
  }

  /** The roster: every test case linked to the run, one row per (test case, configuration). */
  listRunTestCases(projectId, runId) {
    return this.getAllPages(
      `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/test-cases`,
      'test_cases',
    );
  }

  /** The chronological source of truth: every result posted in the run. */
  listRunResults(projectId, runId) {
    return this.getAllPages(
      `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/results`,
      'test_results',
    );
  }

  /** Docs show an unscoped path; the project-scoped variant is the likelier real shape. */
  async listConfigurations(projectId) {
    try {
      return await this.getAllPages(
        `/projects/${encodeURIComponent(projectId)}/configurations`, 'configurations');
    } catch (error) {
      if (error.status !== 404) throw error;
      try {
        return await this.getAllPages('/configurations', 'configurations');
      } catch (fallbackError) {
        if (fallbackError.status === 404) return []; // labels are cosmetic — degrade to raw ids
        throw fallbackError;
      }
    }
  }
}

function explainHttpError(status, url, body) {
  const detail = typeof body === 'string'
    ? body.slice(0, 400)
    : JSON.stringify(body ?? {}).slice(0, 400);
  const where = `${url.pathname}${url.search}`;
  if (status === 401 || status === 403) {
    return `HTTP ${status} on ${where} — credentials rejected. ` +
           'Check BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY, and that this account ' +
           `has Test Management access.\n${detail}`;
  }
  if (status === 404) {
    return `HTTP 404 on ${where} — not found in this account. ` +
           `Verify the project/run id is correct and visible to you.\n${detail}`;
  }
  if (status === 429) {
    return `HTTP 429 on ${where} — rate limited by BrowserStack. Retry in a minute.\n${detail}`;
  }
  return `HTTP ${status} on ${where}\n${detail}`;
}
