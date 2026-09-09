#!/usr/bin/env node
/**
 * Local web UI for the test case-level report.
 *
 *   node server.mjs            → http://127.0.0.1:4173
 *   node server.mjs --port 8080
 *
 * Serves the same modules the CLI uses, so the page and the downloaded file are byte-identical.
 * Binds to loopback only — the process holds BrowserStack credentials and must not be reachable
 * from the network.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { TestManagementClient, ApiError } from './src/api.mjs';
import { aggregate, buildConfigLabels } from './src/aggregate.mjs';
import { renderHtml } from './src/render.mjs';
import { renderApp } from './src/ui.mjs';
import { groupRunsByBuild, findBuildForRun, findBuildByName } from './src/builds.mjs';

const HOST = '127.0.0.1';

function parsePort(argv) {
  const index = argv.findIndex((token) => token === '--port' || token === '-p');
  const inline = argv.find((token) => token.startsWith('--port='));
  const raw = inline ? inline.split('=')[1] : (index >= 0 ? argv[index + 1] : null);
  const port = Number(raw ?? process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`\n✖ Invalid port: ${raw}\n`);
    process.exit(1);
  }
  return port;
}

let client;
try {
  client = new TestManagementClient();
} catch (error) {
  console.error(`\n✖ ${error.message}\n`);
  process.exit(1);
}

/**
 * Only near-static reference data is cached: the project list and the configuration list (which is
 * hundreds of rows and slow to fetch, but changes almost never).
 *
 * Test runs, the linked-case roster, and results are NEVER cached. This report exists to answer
 * "what is the latest status", so serving a even slightly stale result is not a performance
 * trade-off, it is a wrong answer — re-run a build, reload, and you would be reading the previous
 * run's numbers with nothing on screen to say so.
 */
const cache = new Map();
const REFERENCE_TTL_MS = 10 * 60_000;

/**
 * Builds shown in the sidebar at a time. Unrelated to the API's own page size (see api.mjs): the
 * full listing is fetched either way and sliced here, so this changes only how much is drawn.
 */
const BUILD_PAGE_SIZE = 10;
const MAX_BUILD_PAGE_SIZE = 200;

/**
 * How long a *listing* of builds may be reused. Short, because it only has to outlive a user
 * paging and filtering through the sidebar — the thing this exists to stop is one click on
 * "next page" re-running an identifier sweep and earning a 429. Raise it on a busy account where
 * the sweep is expensive; lower it if a newly finished build must appear in the list sooner.
 * Only affects which builds are LISTED — an opened report is always fetched live.
 */
const BUILDS_TTL_MS = Number(process.env.BSTACK_BUILDS_TTL_MS) || 60_000;

async function cachedReference(key, producer, { force = false } = {}) {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < REFERENCE_TTL_MS) return hit.value;
  const value = await producer();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Lists runs (including any the list endpoint omits) and groups them into builds. */
async function listBuilds(projectId) {
  const { runs, unindexed } = await client.listTestRunsIncludingUnindexed(projectId);
  return { builds: groupRunsByBuild(runs), unindexed };
}

/**
 * The sidebar listing, briefly memoised, and de-duplicated so N concurrent callers share ONE
 * upstream fetch instead of N sweeps.
 *
 * This is the only run data that is ever reused, and it is reused only for navigation — deciding
 * which builds to draw in the list. `buildReport` deliberately does NOT come through here: the
 * numbers in a report stay live, because a stale result there is not a slow answer, it is a wrong
 * one. The worst a stale listing can do is briefly omit a build from the sidebar, and Refresh
 * (or the 60s expiry) brings it back.
 */
const inFlightBuilds = new Map();

async function buildsSnapshot(projectId, { force = false } = {}) {
  const key = `builds:${projectId}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < BUILDS_TTL_MS) return hit.value;

  const pending = inFlightBuilds.get(key);
  if (pending && !force) return pending;

  const promise = (async () => {
    const { builds, unindexed } = await listBuilds(projectId);
    if (unindexed.length) {
      console.log(`  recovered run(s) missing from the list: ${unindexed.join(', ')}`);
    }
    const value = { builds, unindexed, fetchedAt: Date.now() };
    cache.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => inFlightBuilds.delete(key));

  inFlightBuilds.set(key, promise);
  return promise;
}

const matchesQuery = (build, query) =>
  (`${build.name} ${build.runIds.join(' ')}`).toLowerCase().includes(query);

/** Clamps to a sane range rather than rejecting — a bad page number is not worth a 400. */
function readPaging(url) {
  const rawSize = Number(url.searchParams.get('page_size'));
  const pageSize = Number.isInteger(rawSize) && rawSize > 0
    ? Math.min(rawSize, MAX_BUILD_PAGE_SIZE)
    : BUILD_PAGE_SIZE;
  const rawPage = Number(url.searchParams.get('page'));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { page, pageSize };
}

/**
 * Gathers every test run belonging to one build and folds them into a single report model.
 *
 * Runs are merged oldest → newest so that later results win: `aggregate` resolves each test case
 * to its chronologically latest result, and the roster's `latest_status` is overwritten in the
 * same order. A build whose first run failed and whose re-run passed therefore reads as passed.
 */
async function buildReport(projectId, { buildName, runId } = {}, { force = false } = {}) {
  const { builds } = await listBuilds(projectId);

  let build = buildName ? findBuildByName(builds, buildName) : null;
  if (!build && runId) build = findBuildForRun(builds, runId);

  // A run the listing never returned: fall back to just that run, on its own.
  if (!build) {
    if (!runId) {
      const error = new Error(`No build named "${buildName}" in ${projectId}`);
      error.statusCode = 404;
      throw error;
    }
    const record = await client.findTestRun(projectId, runId);
    if (!record) {
      const error = new Error(`${runId} not found in ${projectId}`);
      error.statusCode = 404;
      throw error;
    }
    build = groupRunsByBuild([record])[0];
  }

  const perRun = await Promise.all(build.runs.map(async (run) => ({
    run,
    roster: await client.listRunTestCases(projectId, run.identifier),
    results: await client.listRunResults(projectId, run.identifier),
  })));

  // Oldest → newest concatenation is what makes "later run wins" fall out naturally.
  const roster = perRun.flatMap(({ roster: rows }) => rows);
  const results = perRun.flatMap(({ run, results: rows }) =>
    rows.map((row) => ({ ...row, __runId: run.identifier })));

  const configurations = await cachedReference(
    `configs:${projectId}`, () => client.listConfigurations(projectId), { force });

  let project = { identifier: projectId };
  try {
    const body = await cachedReference(`project:${projectId}`, () => client.getProject(projectId), { force });
    project = { identifier: projectId, ...(body?.project ?? body ?? {}) };
  } catch { /* the project record only supplies a display name */ }

  const model = aggregate({ roster, results, configLabels: buildConfigLabels(configurations) });

  return {
    project,
    build: {
      name: build.name, runIds: build.runIds, runState: build.runState,
      firstAt: build.firstAt, lastAt: build.lastAt, tags: build.tags,
      runs: build.runs.map((run) => ({
        identifier: run.identifier, created_at: run.created_at, run_state: run.run_state,
        resultCount: perRun.find((p) => p.run.identifier === run.identifier)?.results.length ?? 0,
      })),
    },
    model,
    fetchedAt: Date.now(),
    counts: { roster: roster.length, results: results.length, runs: build.runs.length },
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendHtml(res, status, html, { filename } = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
    ...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
  });
  res.end(html);
}

const safeSlug = (value) => String(value).replace(/[^A-Za-z0-9._-]/g, '_');

const routes = {
  async 'GET /api/projects'(url, res) {
    const force = url.searchParams.get('refresh') === '1';
    const projects = await cachedReference('projects', () => client.listProjects(), { force });
    sendJson(res, 200, { projects });
  },

  /**
   * One page of the build list. Probes past the API's own listing so a just-finished build is
   * selectable immediately, then filters and slices in memory — so paging and typing in the filter
   * cost nothing upstream. `refresh=1` re-fetches.
   */
  async 'GET /api/builds'(url, res) {
    const projectId = requireParam(url, 'project');
    const force = url.searchParams.get('refresh') === '1';
    const { builds, unindexed, fetchedAt } = await buildsSnapshot(projectId, { force });

    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const matches = query ? builds.filter((build) => matchesQuery(build, query)) : builds;

    const { pageSize } = readPaging(url);
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const page = Math.min(readPaging(url).page, totalPages);   // a stale page number lands on the last
    const start = (page - 1) * pageSize;

    sendJson(res, 200, {
      // The run records themselves are not needed client-side.
      builds: matches.slice(start, start + pageSize).map(({ runs, ...rest }) => rest),
      page,
      pageSize,
      totalPages,
      total: matches.length,        // after the filter
      totalBuilds: builds.length,   // before it
      filtered: Boolean(query),
      unindexed,
      fetchedAt,
    });
  },

  async 'GET /api/report'(url, res) {
    const projectId = requireParam(url, 'project');
    const buildName = url.searchParams.get('build');
    const runId = url.searchParams.get('run');
    if (!buildName && !runId) {
      const error = new Error('Pass either "build" or "run"');
      error.statusCode = 400;
      throw error;
    }
    const force = url.searchParams.get('refresh') === '1';
    const report = await buildReport(projectId, { buildName, runId }, { force });

    if (url.searchParams.get('format') === 'json') {
      const { project, build, model, counts, fetchedAt } = report;
      return sendJson(res, 200, { project, build, counts, fetchedAt, ...model });
    }
    const html = renderHtml(report);
    const download = url.searchParams.get('download') === '1';
    sendHtml(res, 200, html, {
      filename: download
        ? `${safeSlug(projectId)}-${safeSlug(report.build.name)}.html`
        : undefined,
    });
  },

  /** Writes the report to reports/ so the UI has parity with the CLI's output. */
  async 'POST /api/save'(url, res) {
    const projectId = requireParam(url, 'project');
    const report = await buildReport(projectId, {
      buildName: url.searchParams.get('build'), runId: url.searchParams.get('run'),
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.resolve('reports',
      `${safeSlug(projectId)}-${safeSlug(report.build.name)}-${stamp}.html`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, renderHtml(report), 'utf8');
    console.log(`  saved ${outPath}`);
    sendJson(res, 200, { path: outPath });
  },
};

function requireParam(url, name) {
  const value = url.searchParams.get(name);
  if (!value) {
    const error = new Error(`Missing required query parameter "${name}"`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const key = `${req.method} ${url.pathname}`;

  try {
    if (key === 'GET /' || key === 'GET /index.html') return sendHtml(res, 200, renderApp());
    if (key === 'GET /favicon.ico') return res.writeHead(204).end();

    const handler = routes[key];
    if (!handler) return sendJson(res, 404, { error: `No route for ${key}` });
    await handler(url, res);
  } catch (error) {
    const status = error instanceof ApiError
      ? (error.status && error.status >= 400 && error.status < 600 ? error.status : 502)
      : (error.statusCode ?? 500);
    console.error(`  ✖ ${key} → ${status}: ${error.message.split('\n')[0]}`);
    if (!res.headersSent) sendJson(res, status, { error: error.message });
    else res.end();
  }
});

const port = parsePort(process.argv.slice(2));
server.listen(port, HOST, () => {
  console.log(`\n  Test case report UI → http://${HOST}:${port}\n  (Ctrl+C to stop)\n`);
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n✖ Port ${port} is already in use. Try: node server.mjs --port ${port + 1}\n`);
    process.exit(1);
  }
  throw error;
});
