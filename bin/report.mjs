#!/usr/bin/env node
/**
 * Test case-level status report for BrowserStack Test Management automation runs.
 *
 *   node bin/report.mjs --project PR-155 --list
 *   node bin/report.mjs --project PR-155 --run latest
 *   node bin/report.mjs --project PR-155            # interactive run picker
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { TestManagementClient, ApiError } from '../src/api.mjs';
import { aggregate, buildConfigLabels } from '../src/aggregate.mjs';
import { renderHtml } from '../src/render.mjs';
import { groupRunsByBuild, findBuildForRun, findBuildByName } from '../src/builds.mjs';

const USAGE = `
Test case-level status report for BrowserStack Test Management

Usage
  node bin/report.mjs [options]

Options
  --project, -p <PR-id>   Project identifier (e.g. PR-155). Prompts if omitted.
  --build, -b <name>      Build name, or "latest". Prompts if omitted.
  --run, -r <TR-id>       A test run id; reports the whole build that run belongs to.
  --list, -l              Print the project's builds and exit.
  --out, -o <path>        Output HTML path. Default: reports/<PR>-<TR>-<timestamp>.html
  --json                  Also write the aggregated model as JSON next to the HTML.
  --raw <resource>        Dump raw API JSON and exit. One of:
                          projects | test-runs | test-cases | results | configurations
  --open                  Open the report in the default browser when done.
  --help, -h              Show this help.

Credentials
  Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY, or copy .env.example to .env.
`;

function parseArgs(argv) {
  const options = {};
  const aliases = { p: 'project', r: 'run', b: 'build', l: 'list', o: 'out', h: 'help' };
  const takesValue = new Set(['project', 'run', 'build', 'out', 'raw']);

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('-')) continue;
    let [flag, inlineValue] = token.replace(/^--?/, '').split('=');
    flag = aliases[flag] ?? flag;
    if (takesValue.has(flag)) {
      options[flag] = inlineValue ?? argv[++i];
      if (options[flag] === undefined) fail(`Missing value for --${flag}`);
    } else {
      options[flag] = true;
    }
  }
  return options;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function prompt(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Renders rows as an aligned table without pulling in a formatting dependency. */
function printTable(rows, columns) {
  if (rows.length === 0) return console.log('  (none)');
  const widths = columns.map((column) => Math.max(
    column.header.length,
    ...rows.map((row) => String(column.value(row) ?? '').length),
  ));
  const line = (cells) => '  ' + cells.map((cell, i) =>
    String(cell ?? '').padEnd(widths[i])).join('  ').trimEnd();

  console.log(line(columns.map((c) => c.header)));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) console.log(line(columns.map((c) => c.value(row))));
}

const shortDate = (iso) => {
  const ms = Date.parse(iso ?? '');
  return Number.isNaN(ms) ? '—' : new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
};

/** Test runs newest first — that is the order someone picking a build expects. */
const byNewest = (a, b) => (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0);

async function pickProject(client, given) {
  if (given) return given;
  const projects = await client.listProjects();
  if (projects.length === 0) fail('No projects visible to this account.');
  console.log('\nProjects\n');
  printTable(projects.map((p, i) => ({ ...p, _n: i + 1 })), [
    { header: '#', value: (p) => p._n },
    { header: 'ID', value: (p) => p.identifier },
    { header: 'NAME', value: (p) => p.name },
  ]);
  const answer = await prompt('\nProject (number or PR-id): ');
  const byIndex = projects[Number(answer) - 1];
  return byIndex?.identifier ?? answer;
}

async function pickBuild(builds, given) {
  if (builds.length === 0) fail('This project has no test runs.');
  if (given === 'latest') return builds[0];
  if (given) {
    const match = findBuildByName(builds, given);
    if (!match) fail(`No build named "${given}". Run with --list to see the available builds.`);
    return match;
  }
  const answer = await prompt('\nBuild (number or name): ');
  return builds[Number(answer) - 1] ?? findBuildByName(builds, answer)
    ?? fail(`No build matching "${answer}".`);
}

function printBuilds(builds) {
  console.log(`\nBuilds (${builds.length}, newest first)\n`);
  printTable(builds.map((build, i) => ({ ...build, _n: i + 1 })), [
    { header: '#', value: (b) => b._n },
    { header: 'BUILD', value: (b) => b.name },
    { header: 'RUNS', value: (b) => (b.runIds.length > 1 ? `${b.runIds.length} ×` : '1') },
    { header: 'RUN IDS', value: (b) => b.runIds.join(', ') },
    { header: 'STATE', value: (b) => b.runState ?? '—' },
    { header: 'LAST RUN', value: (b) => shortDate(b.lastAt) },
  ]);
}

async function dumpRaw(client, resource, projectId, runId) {
  const fetchers = {
    projects: () => client.listProjects(),
    'test-runs': () => client.listTestRuns(projectId),
    'test-cases': () => client.listRunTestCases(projectId, runId),
    results: () => client.listRunResults(projectId, runId),
    configurations: () => client.listConfigurations(projectId),
  };
  const fetcher = fetchers[resource];
  if (!fetcher) fail(`Unknown --raw resource "${resource}". One of: ${Object.keys(fetchers).join(', ')}`);
  if (['test-cases', 'results'].includes(resource) && !runId) fail(`--raw ${resource} needs --run <TR-id>`);
  console.log(JSON.stringify(await fetcher(), null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(USAGE);

  const client = new TestManagementClient();

  if (options.raw) {
    const projectId = options.project ?? await pickProject(client, null);
    return dumpRaw(client, options.raw, projectId, options.run);
  }

  const projectId = await pickProject(client, options.project);

  const { runs: allRuns, unindexed } = await client.listTestRunsIncludingUnindexed(projectId);
  if (unindexed.length) {
    console.warn(`\n! recovered ${unindexed.length} run(s) the API's list endpoint hides ` +
                 `(it returns only the first run of each build): ${unindexed.slice(0, 4).join(', ')}` +
                 `${unindexed.length > 4 ? `, +${unindexed.length - 4} more` : ''}`);
  }
  const builds = groupRunsByBuild(allRuns);

  if (options.list) {
    printBuilds(builds);
    return;
  }

  // A run id selects the whole build it belongs to — re-runs of one build report together.
  let build = options.run ? findBuildForRun(builds, options.run) : null;
  if (options.run && !build) {
    console.warn(`\n! ${options.run} is not in this project's run list — fetching it directly.`);
    const record = await client.findTestRun(projectId, options.run);
    if (!record) fail(`${options.run} not found in ${projectId}`);
    build = groupRunsByBuild([record])[0];
  }
  if (!build) {
    if (!options.build) printBuilds(builds);
    build = await pickBuild(builds, options.build);
  }

  console.log(`\nFetching "${build.name}" (${build.runIds.length} test run${
    build.runIds.length === 1 ? '' : 's'}: ${build.runIds.join(', ')})…`);

  // Oldest → newest, so later results win when they are merged.
  const perRun = [];
  for (const run of build.runs) {
    perRun.push({
      run,
      roster: await client.listRunTestCases(projectId, run.identifier),
      results: await client.listRunResults(projectId, run.identifier),
    });
  }
  const configurations = await client.listConfigurations(projectId);

  const roster = perRun.flatMap((entry) => entry.roster);
  const results = perRun.flatMap((entry) =>
    entry.results.map((row) => ({ ...row, __runId: entry.run.identifier })));
  for (const entry of perRun) {
    console.log(`  ${entry.run.identifier}: ${entry.roster.length} linked rows · ${entry.results.length} results`);
  }

  let project = { identifier: projectId };
  try {
    const body = await client.getProject(projectId);
    project = { identifier: projectId, ...(body?.project ?? body ?? {}) };
  } catch (error) {
    if (error.status === 404) throw error;
  }

  const model = aggregate({ roster, results, configLabels: buildConfigLabels(configurations) });

  if (model.testCases.length === 0) {
    console.warn('\n! No linked test cases found for this build.');
    console.warn('  If it came from automation, confirm the tests carry Test Case ID tags.');
    console.warn(`  Inspect the raw payloads with:  node bin/report.mjs -p ${projectId} -r ${build.runIds[0]} --raw results`);
  }

  const payload = {
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
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = build.name.replace(/[^A-Za-z0-9._-]/g, '_');
  const outPath = path.resolve(options.out ?? path.join('reports', `${projectId}-${slug}-${stamp}.html`));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderHtml(payload), 'utf8');

  const { totals } = model;
  console.log(`\n  ${totals.total} test cases · ${totals.passed ?? 0} passed · ${totals.failed ?? 0} failed · ` +
              `${totals.untested ?? 0} untested${totals.passRate == null ? '' : ` · ${totals.passRate}% pass rate`}`);
  if (model.disagreementCount > 0) {
    console.warn(`  ! ${model.disagreementCount} case(s) disagree with the API's latest_status — flagged in the report.`);
  }
  console.log(`\n✔ ${outPath}\n`);

  if (options.json) {
    const jsonPath = outPath.replace(/\.html$/, '.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ...payload, ...model }, null, 2), 'utf8');
    console.log(`✔ ${jsonPath}\n`);
  }
  if (options.open) {
    const { spawn } = await import('node:child_process');
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(opener, [outPath], { detached: true, stdio: 'ignore' }).unref();
  }
}

main().catch((error) => {
  if (error instanceof ApiError) fail(error.message);
  console.error(error);
  process.exit(1);
});
