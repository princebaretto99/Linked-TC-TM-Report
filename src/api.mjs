/**
 * Thin client for the BrowserStack Test Management REST API (v2).
 * Docs: https://www.browserstack.com/docs/test-management/api-reference/introduction
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://test-management.browserstack.com/api/v2';
// The API accepts ONLY 30 or 300 — not an arbitrary value in that range. 300 is deliberate:
// it is the setting that makes the FEWEST requests, and requests are the thing being limited.
// Dropping to 30 would turn one call into ten and trip the limiter ten times sooner. The 30-per-page
// list in the web UI is a separate, display-only page size — see BUILD_PAGE_SIZE in server.mjs.
const PAGE_SIZE = 300;
const MAX_PAGES = 100;   // runaway guard

/**
 * Rate-limit budget. A full identifier sweep is hundreds of requests, so it must be paced rather
 * than fired in a burst; `MIN_GAP_MS` is what actually caps throughput (~16 req/s by default),
 * `MAX_CONCURRENCY` just stops a slow response from stalling the queue behind it.
 * Both are tunable without a code change if BrowserStack's ceiling turns out to differ per account.
 */
const MAX_CONCURRENCY = Number(process.env.BSTACK_MAX_CONCURRENCY) || 4;
const MIN_GAP_MS = Number(process.env.BSTACK_MIN_REQUEST_GAP_MS) || 60;
const MAX_RETRIES = Number(process.env.BSTACK_MAX_RETRIES) || 4;
const MAX_BACKOFF_MS = 30_000;

/**
 * Candidate count above which it is worth spending one list call per project to rule ids out
 * (see `#runIdsOwnedElsewhere`). Below it, probing directly is the cheaper of the two.
 */
const OWNERSHIP_MAP_THRESHOLD = Number(process.env.BSTACK_OWNERSHIP_MAP_THRESHOLD) || 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serialises every outbound call in the process behind one budget: at most `concurrency` in
 * flight, and never two starts closer together than `minGapMs`.
 *
 * `pauseFor` is the part that matters on a 429. Rate limits are per account, not per request, so
 * one rejection means every other in-flight call is about to be rejected too — parking the whole
 * queue for the retry window turns a cascade of failures into one short stall.
 */
class RequestThrottle {
  constructor({ concurrency = MAX_CONCURRENCY, minGapMs = MIN_GAP_MS } = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.minGapMs = Math.max(0, minGapMs);
    this.active = 0;
    this.queue = [];
    this.lastStart = 0;
    this.pausedUntil = 0;
    this.timer = null;
  }

  /** Holds back every queued and future request until `ms` from now. */
  pauseFor(ms) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.#pump();
    });
  }

  #pump() {
    if (this.queue.length === 0 || this.active >= this.concurrency) return;

    const now = Date.now();
    const readyAt = Math.max(this.pausedUntil, this.lastStart + this.minGapMs);
    if (readyAt > now) {
      // One shared timer — every pump() while waiting must not stack up its own.
      if (this.timer === null) {
        this.timer = setTimeout(() => { this.timer = null; this.#pump(); }, readyAt - now);
      }
      return;
    }

    const { task, resolve, reject } = this.queue.shift();
    this.active += 1;
    this.lastStart = now;
    Promise.resolve().then(task).then(resolve, reject).finally(() => {
      this.active -= 1;
      this.#pump();
    });
    this.#pump();   // fill the remaining concurrency slots (each re-checks the gap)
  }
}

/**
 * A connection that never completed, rather than a server that answered. Worth retrying, and
 * worth retrying FAST: the common case is a keep-alive socket the far end closed while idle, which
 * fails instantly and succeeds on the very next attempt.
 */
function networkRetryDelayMs(attempt) {
  const backoff = Math.min(250 * 2 ** attempt, 4000);
  return Math.round(backoff * (0.75 + Math.random() * 0.5));
}

/**
 * undici reports every connection failure as the same bare "fetch failed"; the code that says what
 * actually happened (ECONNRESET, ENOTFOUND, UND_ERR_SOCKET…) is buried in the cause chain.
 */
function describeCause(error) {
  const parts = [];
  for (let node = error, depth = 0; node && depth < 5; node = node.cause, depth++) {
    const text = node.code ? `${node.code} ${node.message ?? ''}`.trim() : node.message;
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts.join(' — ') || String(error);
}

/** `Retry-After` is authoritative when present; otherwise back off exponentially with jitter. */
function retryDelayMs(response, attempt) {
  const header = response?.headers?.get?.('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_BACKOFF_MS);
  }
  const backoff = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(backoff * (0.75 + Math.random() * 0.5));   // jitter, so retries don't resync
}

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
    /** Promise of runId → owning project, built lazily and at most once. */
    this.ownershipMap = null;
    /** One budget for the whole client — see RequestThrottle. */
    this.throttle = new RequestThrottle();
    /** Set while a 429 is being waited out, so callers can surface "backing off" instead of stalling. */
    this.onThrottled = null;
  }

  /**
   * Every call to the API goes through here, so this is the one place that has to be
   * rate-limit-aware: paced by the shared throttle, and retried with backoff on the statuses that
   * mean "later, not never" (429, and the 5xx that BrowserStack returns when a limiter sheds load).
   */
  async request(pathname, { searchParams = {}, retries = MAX_RETRIES } = {}) {
    const url = new URL(BASE_URL + pathname);
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await this.throttle.run(() => fetch(url, {
          headers: { Authorization: this.auth, Accept: 'application/json' },
        }));
      } catch (cause) {
        // A dropped connection is not an answer — retry it, exactly like a 429. Without this a
        // single stale keep-alive socket surfaces in the UI as a hard 502.
        if (attempt < retries) {
          const delay = networkRetryDelayMs(attempt);
          this.onThrottled?.({ status: 0, url: url.href, delay, attempt: attempt + 1 });
          await sleep(delay);
          continue;
        }
        throw new ApiError(
          `Network error calling ${url.pathname} after ${attempt + 1} attempts: ` +
          `${describeCause(cause)}\nCheck connectivity to ${url.host} (VPN or proxy, if you use one).`,
          { url: url.href });
      }

      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }

      if (response.ok) return body;

      if (isRetryable(response.status) && attempt < retries) {
        const delay = retryDelayMs(response, attempt);
        // Park every other queued request too: the limit is per account, not per request.
        this.throttle.pauseFor(delay);
        this.onThrottled?.({ status: response.status, url: url.href, delay, attempt: attempt + 1 });
        await sleep(delay);
        continue;
      }

      throw new ApiError(explainHttpError(response.status, url, body, { attempts: attempt + 1 }), {
        status: response.status, url: url.href, body,
      });
    }
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

    // Run identifiers are allocated per ACCOUNT, not per project, so a sparse project's range is
    // mostly other projects' runs. Measured on PR-24: of 882 ids in TR-242..TR-1183, 863 were
    // listed under some other project and only 19 were unaccounted for — 53s of 404s to learn
    // nothing. A run another project lists cannot also be a hidden run of this one, so those are
    // provably skippable. Only worth the ownership map when the sweep is big enough to pay for it.
    if (candidates.size > OWNERSHIP_MAP_THRESHOLD) {
      const elsewhere = await this.#runIdsOwnedElsewhere(projectId);
      for (const id of elsewhere) candidates.delete(id);
    }

    const found = await this.#probeRuns(projectId, [...candidates]);
    this.sweptProjects.add(projectId);

    const store = this.discoveredRuns.get(projectId) ?? new Set();
    for (const run of found) store.add(run.identifier);
    this.discoveredRuns.set(projectId, store);

    return { runs: [...runs, ...found], unindexed: found.map((run) => run.identifier) };
  }

  /**
   * Every run id the account lists under a project OTHER than `projectId`.
   *
   * Built once per process from one list call per project, and deliberately conservative: the list
   * endpoint hides re-runs, so a hidden run of another project is simply absent here and stays in
   * the candidate set. Nothing is skipped that has not been positively attributed elsewhere.
   *
   * Degrades to an empty set — sweep everything, as before — if the account cannot be enumerated.
   */
  #runIdsOwnedElsewhere(projectId) {
    this.ownershipMap ??= (async () => {
      const projects = await this.listProjects();
      const owners = new Map();
      await Promise.all(projects.map(async (project) => {
        const runs = await this.listTestRuns(project.identifier).catch(() => []);
        for (const run of runs) owners.set(run.identifier, project.identifier);
      }));
      return owners;
    })().catch(() => new Map());

    return this.ownershipMap.then((owners) => {
      const elsewhere = new Set();
      for (const [runId, owner] of owners) if (owner !== projectId) elsewhere.add(runId);
      return elsewhere;
    });
  }

  /**
   * A sweep is hundreds of mostly-404 requests, and firing them in a burst is what earned the 429s
   * this client used to fall over on. They are all handed to the throttle at once and it releases
   * them at the budgeted rate — which is both gentler and faster than fixed batches, since a slow
   * response no longer holds up the eleven ids queued behind it.
   */
  async #probeRuns(projectId, ids) {
    const settled = await Promise.all(ids.map((id) => this.findTestRun(projectId, id)));
    return settled.filter(Boolean);
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

/** 429 is the rate limiter; 502/503/504 are the load shedders in front of it. */
function isRetryable(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function explainHttpError(status, url, body, { attempts = 1 } = {}) {
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
    return `HTTP 429 on ${where} — still rate limited by BrowserStack after ${attempts} ` +
           `attempt${attempts === 1 ? '' : 's'} with backoff. Wait a minute, then retry. ` +
           'If this is persistent, lower the request rate: ' +
           'BSTACK_MIN_REQUEST_GAP_MS (default ' + MIN_GAP_MS + ') and ' +
           'BSTACK_MAX_CONCURRENCY (default ' + MAX_CONCURRENCY + `).\n${detail}`;
  }
  return `HTTP ${status} on ${where}\n${detail}`;
}
