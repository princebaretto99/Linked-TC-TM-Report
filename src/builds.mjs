/**
 * Groups test runs into builds.
 *
 * A re-run does not append to the existing test run — BrowserStack creates a NEW test run carrying
 * the SAME build name. PR-155 ended up with TR-1194 and TR-1195 both named "browserstack build
 * #40", the first with failures and the second (the re-run) all green. Reporting them separately
 * makes a build look broken when it is not, so the build name is the unit of reporting and every
 * run under it is unioned.
 */

/** Runs with no usable name fall back to their own identifier, so they never merge with others. */
const buildKey = (run) => (run?.name ?? '').trim() || run?.identifier || 'Unnamed';

const timeOf = (run) => Date.parse(run?.created_at ?? '') || 0;

/**
 * @returns {Array<{name, key, runs, runIds, firstAt, lastAt, runState}>} newest build first,
 *          each build's runs ordered oldest → newest.
 */
export function groupRunsByBuild(runs = []) {
  const builds = new Map();

  for (const run of runs) {
    const key = buildKey(run);
    if (!builds.has(key)) builds.set(key, { name: key, key, runs: [] });
    builds.get(key).runs.push(run);
  }

  const grouped = [...builds.values()].map((build) => {
    // Oldest first: later runs must overwrite earlier ones when their results are merged.
    build.runs.sort((a, b) => timeOf(a) - timeOf(b));
    const newest = build.runs[build.runs.length - 1];
    return {
      ...build,
      runIds: build.runs.map((run) => run.identifier),
      firstAt: build.runs[0]?.created_at ?? null,
      lastAt: newest?.created_at ?? null,
      runState: newest?.run_state ?? null,
      assignee: newest?.assignee ?? null,
      tags: newest?.tags ?? [],
    };
  });

  grouped.sort((a, b) => (Date.parse(b.lastAt ?? '') || 0) - (Date.parse(a.lastAt ?? '') || 0));
  return grouped;
}

/** Finds the build a given run belongs to, so a `?run=TR-x` link lands on the merged view. */
export function findBuildForRun(builds, runId) {
  return builds.find((build) => build.runIds.includes(runId)) ?? null;
}

export function findBuildByName(builds, name) {
  return builds.find((build) => build.key === name) ?? null;
}
