import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, normalizeStatus, buildConfigLabels } from '../src/aggregate.mjs';

/** Mirrors a result row as the TM API returns it. */
const result = (id, testCaseId, status, isoTime, extra = {}) => ({
  id,
  test_case_id: testCaseId,
  result_status: { field_value: status },
  created_at: isoTime,
  configuration_id: 101,
  ...extra,
});

const rosterRow = (identifier, name, latestStatus = 'untested', configurationId = 101) => ({
  identifier, name, latest_status: latestStatus, configuration_id: configurationId,
});

const byId = (model) => Object.fromEntries(model.testCases.map((tc) => [tc.id, tc]));

test('the owner\'s scenario: overlapping it blocks resolve per test case', () => {
  // it-1 -> (TC-1, TC-2) passes at T1; it-2 -> (TC-2, TC-3) fails later at T2.
  const model = aggregate({
    roster: [rosterRow('TC-1', 'one'), rosterRow('TC-2', 'two'), rosterRow('TC-3', 'three')],
    results: [
      result(1, 'TC-1', 'Passed', '2026-09-04T10:00:00.000Z'),
      result(2, 'TC-2', 'Passed', '2026-09-04T10:00:00.000Z'),
      result(3, 'TC-2', 'Failed', '2026-09-04T10:05:00.000Z'),
      result(4, 'TC-3', 'Failed', '2026-09-04T10:05:00.000Z'),
    ],
  });
  const cases = byId(model);
  assert.equal(cases['TC-1'].status.key, 'passed');
  assert.equal(cases['TC-2'].status.key, 'failed');
  assert.equal(cases['TC-3'].status.key, 'failed');
});

test('latest wins, not worst wins: reversing the order flips TC-2 to passed', () => {
  // Same two it blocks, but the passing one finishes last. Under a worst-wins rule TC-2 would
  // still be Failed; under the agreed latest-wins rule it is Passed. This pins the rule down.
  const model = aggregate({
    roster: [rosterRow('TC-1'), rosterRow('TC-2'), rosterRow('TC-3')],
    results: [
      result(1, 'TC-2', 'Failed', '2026-09-04T10:00:00.000Z'),
      result(2, 'TC-3', 'Failed', '2026-09-04T10:00:00.000Z'),
      result(3, 'TC-1', 'Passed', '2026-09-04T10:05:00.000Z'),
      result(4, 'TC-2', 'Passed', '2026-09-04T10:05:00.000Z'),
    ],
  });
  const cases = byId(model);
  assert.equal(cases['TC-2'].status.key, 'passed');
  assert.equal(cases['TC-3'].status.key, 'failed');
});

test('retries on the same config collapse to the last attempt', () => {
  const model = aggregate({
    roster: [rosterRow('TC-1')],
    results: [
      result(10, 'TC-1', 'Failed', '2026-09-04T10:00:00.000Z'),
      result(11, 'TC-1', 'Passed', '2026-09-04T10:00:30.000Z'),
    ],
  });
  assert.equal(byId(model)['TC-1'].status.key, 'passed');
  assert.equal(byId(model)['TC-1'].resultCount, 2, 'both attempts stay visible in the detail row');
});

test('identical timestamps fall back to result id ordering', () => {
  // A fast build posts many results inside the same second; created_at alone cannot order them.
  const sameSecond = '2026-09-04T10:00:00.000Z';
  const model = aggregate({
    roster: [rosterRow('TC-1')],
    results: [
      result(1, 'TC-1', 'Passed', sameSecond),
      result(2, 'TC-1', 'Failed', sameSecond),
    ],
  });
  assert.equal(byId(model)['TC-1'].status.key, 'failed', 'higher id is the later result');
});

test('a linked test case with no results is reported untested, not dropped', () => {
  const model = aggregate({
    roster: [rosterRow('TC-1'), rosterRow('TC-99', 'never ran', 'untested')],
    results: [result(1, 'TC-1', 'Passed', '2026-09-04T10:00:00.000Z')],
  });
  const cases = byId(model);
  assert.equal(cases['TC-99'].status.key, 'untested');
  assert.equal(model.totals.total, 2);
  assert.equal(model.totals.executed, 1);
  assert.equal(model.totals.passRate, 100, 'pass rate excludes untested cases');
});

test('a result for a test case missing from the roster is still reported', () => {
  const model = aggregate({
    roster: [],
    results: [result(1, 'TC-500', 'Failed', '2026-09-04T10:00:00.000Z')],
  });
  assert.equal(model.testCases.length, 1);
  assert.equal(model.testCases[0].status.key, 'failed');
});

test('multiple configurations are all tracked, and the latest one wins the headline', () => {
  const labels = buildConfigLabels([
    { id: 101, name: '', browser: 'Chrome', browser_version: '120', os: 'Windows', os_version: '11' },
    { id: 202, name: 'iPhone 15 Pro iOS 17.1' },
  ]);
  const model = aggregate({
    roster: [rosterRow('TC-1', 'one', 'untested', 101), rosterRow('TC-1', 'one', 'untested', 202)],
    results: [
      result(1, 'TC-1', 'Passed', '2026-09-04T10:00:00.000Z', { configuration_id: 101 }),
      result(2, 'TC-1', 'Failed', '2026-09-04T10:01:00.000Z', { configuration_id: 202 }),
    ],
    configLabels: labels,
  });
  const testCase = byId(model)['TC-1'];
  assert.equal(testCase.status.key, 'failed');
  assert.equal(testCase.winningConfig, 'iPhone 15 Pro iOS 17.1');
  assert.deepEqual(testCase.contributingConfigs.sort(), ['Chrome 120 on Windows 11', 'iPhone 15 Pro iOS 17.1']);
});

test('derived status disagreeing with the API latest_status raises the canary', () => {
  const model = aggregate({
    roster: [rosterRow('TC-1', 'one', 'Passed')],
    results: [result(1, 'TC-1', 'Failed', '2026-09-04T10:00:00.000Z')],
  });
  assert.equal(model.disagreementCount, 1);
  assert.equal(byId(model)['TC-1'].disagrees, true);
});

test('failures sort to the top', () => {
  const model = aggregate({
    roster: [rosterRow('TC-1'), rosterRow('TC-2'), rosterRow('TC-3')],
    results: [
      result(1, 'TC-1', 'Passed', '2026-09-04T10:00:00.000Z'),
      result(2, 'TC-2', 'Failed', '2026-09-04T10:00:00.000Z'),
      result(3, 'TC-3', 'Passed', '2026-09-04T10:00:00.000Z'),
    ],
  });
  assert.equal(model.testCases[0].id, 'TC-2');
});

test('status shapes and custom statuses are handled', () => {
  assert.equal(normalizeStatus('Passed').key, 'passed');
  assert.equal(normalizeStatus('PASSED').key, 'passed');
  assert.equal(normalizeStatus('un_tested').key, 'untested');
  assert.equal(normalizeStatus(null).key, 'untested');
  const custom = normalizeStatus('Needs Triage');
  assert.equal(custom.key, 'other');
  assert.equal(custom.label, 'Needs Triage', 'custom TM statuses pass through rather than vanish');
});

test('a bare string status (unwrapped) is read correctly', () => {
  const model = aggregate({
    roster: [rosterRow('TC-1')],
    results: [{ id: 1, test_case_id: 'TC-1', status: 'Failed', created_at: '2026-09-04T10:00:00.000Z' }],
  });
  assert.equal(byId(model)['TC-1'].status.key, 'failed');
});

test('TC-9 sorts before TC-10', () => {
  const model = aggregate({
    roster: [rosterRow('TC-10'), rosterRow('TC-9')],
    results: [
      result(1, 'TC-10', 'Passed', '2026-09-04T10:00:00.000Z'),
      result(2, 'TC-9', 'Passed', '2026-09-04T10:00:00.000Z'),
    ],
  });
  assert.deepEqual(model.testCases.map((tc) => tc.id), ['TC-9', 'TC-10']);
});

test('execution_id recovers the it-block grouping and its sibling test cases', () => {
  // Mirrors build #38: three `it` blocks, four test cases, TC-1778 fed by two of them.
  const exec = (executionId) => ({ execution_id: executionId });
  const model = aggregate({
    roster: [],
    results: [
      { id: 1, test_case_id: 'TC-1756', result_status: { field_value: 'Passed' },
        created_at: '2026-09-04T07:42:56Z', ...exec('aaaa1111') },
      { id: 2, test_case_id: 'TC-1757', result_status: { field_value: 'Passed' },
        created_at: '2026-09-04T07:43:02Z', ...exec('bbbb2222') },
      { id: 3, test_case_id: 'TC-1778', result_status: { field_value: 'Passed' },
        created_at: '2026-09-04T07:43:02Z', ...exec('bbbb2222') },
      { id: 4, test_case_id: 'TC-1758', result_status: { field_value: 'Passed' },
        created_at: '2026-09-04T07:43:10Z', ...exec('cccc3333') },
      { id: 5, test_case_id: 'TC-1778', result_status: { field_value: 'Passed' },
        created_at: '2026-09-04T07:43:10Z', ...exec('cccc3333') },
    ],
  });

  assert.equal(model.executionCount, 3, 'three it blocks');
  assert.equal(model.testCases.length, 4, 'expanding to four test cases is the whole point');

  const cases = byId(model);
  assert.equal(cases['TC-1778'].executionCount, 2, 'TC-1778 is fed by two it blocks');
  assert.equal(cases['TC-1756'].executionCount, 1);

  // Ordinals follow execution order, so #1 is the it block that ran first.
  assert.equal(cases['TC-1756'].results[0].execution.ordinal, 1);
  assert.equal(cases['TC-1757'].results[0].execution.ordinal, 2);

  // The sibling link: TC-1757 and TC-1778 were set by the same automation test.
  assert.deepEqual(cases['TC-1757'].results[0].execution.alsoCovered, ['TC-1778']);
  // TC-1778's newest result came from the it block that also set TC-1758.
  assert.deepEqual(cases['TC-1778'].results[0].execution.alsoCovered, ['TC-1758']);
});

test('results without execution_id degrade to no automation-test attribution', () => {
  const model = aggregate({
    roster: [rosterRow('TC-1')],
    results: [result(1, 'TC-1', 'Passed', '2026-09-04T10:00:00.000Z')],
  });
  assert.equal(model.executionCount, 0);
  assert.equal(model.testCases[0].results[0].execution, null);
});

test('hasDescriptions is false when the API returns null descriptions', () => {
  const bare = aggregate({
    roster: [rosterRow('TC-1')],
    results: [{ id: 1, test_case_id: 'TC-1', result_status: { field_value: 'Passed' },
                created_at: '2026-09-04T10:00:00Z', description: null }],
  });
  assert.equal(bare.hasDescriptions, false, 'SDK runs leave description null');

  const annotated = aggregate({
    roster: [rosterRow('TC-1')],
    results: [{ id: 1, test_case_id: 'TC-1', result_status: { field_value: 'Failed' },
                created_at: '2026-09-04T10:00:00Z', description: 'AssertionError' }],
  });
  assert.equal(annotated.hasDescriptions, true);
});

test('only https result URLs are surfaced as links', () => {
  const model = aggregate({
    roster: [],
    results: [
      { id: 1, test_case_id: 'TC-1', result_status: { field_value: 'Passed' },
        created_at: '2026-09-04T10:00:00Z', urls: { self: 'https://test-management.browserstack.com/x' } },
      { id: 2, test_case_id: 'TC-2', result_status: { field_value: 'Passed' },
        created_at: '2026-09-04T10:00:00Z', urls: { self: 'javascript:alert(1)' } },
    ],
  });
  const cases = byId(model);
  assert.equal(cases['TC-1'].results[0].url, 'https://test-management.browserstack.com/x');
  assert.equal(cases['TC-2'].results[0].url, null, 'non-https URLs are rejected');
});
