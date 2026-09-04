import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRunsByBuild, findBuildForRun, findBuildByName } from '../src/builds.mjs';
import { aggregate } from '../src/aggregate.mjs';

const run = (identifier, name, created_at, extra = {}) =>
  ({ identifier, name, created_at, run_state: 'done', ...extra });

test('runs sharing a build name merge into one build, newest last', () => {
  // The real case: a re-run creates TR-1195 with the SAME name as TR-1194.
  const builds = groupRunsByBuild([
    run('TR-1194', 'browserstack build #40', '2026-09-04T18:56:22Z'),
    run('TR-1193', 'browserstack build #39', '2026-09-04T18:53:16Z'),
    run('TR-1195', 'browserstack build #40', '2026-09-04T19:02:13Z'),
  ]);

  assert.equal(builds.length, 2, 'three runs collapse into two builds');
  assert.equal(builds[0].name, 'browserstack build #40', 'newest build first');
  assert.deepEqual(builds[0].runIds, ['TR-1194', 'TR-1195'],
    'runs ordered oldest → newest so later results win when merged');
  assert.equal(builds[0].lastAt, '2026-09-04T19:02:13Z');
  assert.deepEqual(builds[1].runIds, ['TR-1193']);
});

test('a run resolves to the build that contains it', () => {
  const builds = groupRunsByBuild([
    run('TR-1194', 'build #40', '2026-09-04T18:56:22Z'),
    run('TR-1195', 'build #40', '2026-09-04T19:02:13Z'),
  ]);
  assert.equal(findBuildForRun(builds, 'TR-1195').name, 'build #40');
  assert.equal(findBuildForRun(builds, 'TR-1194').name, 'build #40');
  assert.equal(findBuildForRun(builds, 'TR-9999'), null);
  assert.equal(findBuildByName(builds, 'build #40').runIds.length, 2);
});

test('unnamed runs never merge with each other', () => {
  const builds = groupRunsByBuild([
    run('TR-1', '', '2026-09-04T10:00:00Z'),
    run('TR-2', null, '2026-09-04T11:00:00Z'),
    run('TR-3', '   ', '2026-09-04T12:00:00Z'),
  ]);
  assert.equal(builds.length, 3, 'each falls back to its own identifier as the key');
});

test('merging a failed run with a passing re-run reports the build as passed', () => {
  // TR-1194 failed, the TR-1195 re-run passed. Concatenated oldest → newest.
  const result = (id, tc, status, iso, runId) => ({
    id, test_case_id: tc, result_status: { field_value: status },
    created_at: iso, configuration_id: 1, __runId: runId,
  });
  const model = aggregate({
    roster: [
      { identifier: 'TC-1757', name: 'itBlock2', latest_status: 'failed', configuration_id: 1 },
      { identifier: 'TC-1757', name: 'itBlock2', latest_status: 'passed', configuration_id: 1 },
    ],
    results: [
      result(1, 'TC-1757', 'Failed', '2026-09-04T18:56:16Z', 'TR-1194'),
      result(2, 'TC-1757', 'Passed', '2026-09-04T19:02:35Z', 'TR-1195'),
    ],
  });

  const testCase = model.testCases[0];
  assert.equal(testCase.status.key, 'passed', 'the re-run fixed it');
  assert.equal(testCase.winningRunId, 'TR-1195');
  assert.equal(testCase.resultCount, 2, 'the earlier failure stays visible in the detail row');
  assert.equal(testCase.results[1].status.key, 'failed');
  assert.deepEqual(model.runIdsPresent.sort(), ['TR-1194', 'TR-1195']);
  assert.equal(model.disagreementCount, 0,
    'the newest run\'s latest_status is the one compared against');
});

test('the merge respects time, not run order, when runs overlap', () => {
  // A pathological case: an older run posted a result AFTER the newer run started.
  const result = (id, status, iso, runId) => ({
    id, test_case_id: 'TC-1', result_status: { field_value: status },
    created_at: iso, __runId: runId,
  });
  const model = aggregate({
    roster: [],
    results: [
      result(1, 'Passed', '2026-09-04T19:05:00Z', 'TR-1194'),
      result(2, 'Failed', '2026-09-04T19:02:00Z', 'TR-1195'),
    ],
  });
  assert.equal(model.testCases[0].status.key, 'passed', 'latest timestamp wins regardless of run');
  assert.equal(model.testCases[0].winningRunId, 'TR-1194');
});
