/**
 * Turns run results + the linked-test-case roster into a test-case-level model.
 *
 * Status rule (confirmed with the report owner):
 *   A test case's status is the CHRONOLOGICALLY LATEST result posted against it in the run —
 *   across every `it` block linked to it, every configuration, and every retry.
 *
 * This matters because the mapping is many-to-many: one `it` block can carry several test case
 * IDs, and one test case can be fed by several `it` blocks. So `it-1 -> (TC-1, TC-2)` passing and
 * `it-2 -> (TC-2, TC-3)` failing makes TC-2's status depend on which of the two finished last.
 *
 * Pure functions only — no I/O, so the rule above is unit-testable in isolation.
 */

const STATUS_STYLES = {
  passed:   { key: 'passed',   label: 'Passed',   icon: '✓', rank: 1 },
  failed:   { key: 'failed',   label: 'Failed',   icon: '✕', rank: 0 },
  skipped:  { key: 'skipped',  label: 'Skipped',  icon: '→', rank: 3 },
  blocked:  { key: 'blocked',  label: 'Blocked',  icon: '■', rank: 2 },
  untested: { key: 'untested', label: 'Untested', icon: '○', rank: 4 },
};

/** Maps a raw TM status string onto a display style, passing custom statuses through neutrally. */
export function normalizeStatus(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ...STATUS_STYLES.untested };
  const known = STATUS_STYLES[text.toLowerCase().replace(/[\s_-]+/g, '')];
  if (known) return { ...known };
  return { key: 'other', label: text, icon: '◆', rank: 5 };
}

/** The API is inconsistent about wrapping status in `{ field_value }`; accept either shape. */
function readStatus(result) {
  const candidate = result?.result_status ?? result?.status ?? result?.latest_status;
  if (candidate && typeof candidate === 'object') {
    return candidate.field_value ?? candidate.value ?? candidate.name ?? '';
  }
  return candidate ?? '';
}

/** Result payloads have referred to the test case by several field names across API versions. */
function readTestCaseId(result) {
  const raw = result?.test_case_id ?? result?.test_case_identifier
    ?? result?.testCaseId ?? result?.test_case?.identifier;
  return raw == null ? null : String(raw);
}

/**
 * Results produced by the same automation test (`it` block) execution share an `execution_id`.
 * That is the only thing in the payload that recovers the `it`-block grouping — `description`
 * comes back null for SDK-created runs — so it is what tells you TC-1757 and TC-1778 were set by
 * the same test.
 */
function readExecutionId(result) {
  const raw = result?.execution_id ?? result?.executionId;
  return raw == null ? null : String(raw);
}

/** Deep link to the individual result in Test Management. */
function readResultUrl(result) {
  const url = result?.urls?.self ?? result?.url;
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
}

function readTimestamp(result) {
  const raw = result?.created_at ?? result?.updated_at ?? result?.executed_at;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Descending by timestamp, tie-broken by descending numeric id.
 * A fast automation build posts many results inside the same second, so `created_at` alone
 * is not a stable sort key — the id is the only thing that reliably orders those.
 */
function compareRecencyDesc(a, b) {
  const timeDelta = (b._timestamp ?? -Infinity) - (a._timestamp ?? -Infinity);
  if (timeDelta !== 0) return timeDelta;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

/**
 * Builds `configuration_id -> human label`, preferring the configuration's own name and
 * otherwise composing something readable like "Chrome 120 on Windows 11" / "iPhone 15 Pro iOS 17.1".
 */
export function buildConfigLabels(configurations = []) {
  const labels = new Map();
  for (const config of configurations) {
    if (config?.id == null) continue;
    labels.set(String(config.id), config.name?.trim() || describeConfig(config) || `Config ${config.id}`);
  }
  return labels;
}

function describeConfig(config) {
  const browser = [config.browser, config.browser_version].filter(Boolean).join(' ');
  const platform = [config.device || config.os, config.os_version].filter(Boolean).join(' ');
  if (browser && platform) return `${browser} on ${platform}`;
  return browser || platform || '';
}

/**
 * @returns {{ testCases: object[], totals: object, configsUsed: string[], disagreementCount: number }}
 */
export function aggregate({ roster = [], results = [], configLabels = new Map() } = {}) {
  const cases = new Map();

  const ensure = (id) => {
    if (!cases.has(id)) {
      cases.set(id, {
        id,
        title: '',
        priority: null,
        caseType: null,
        apiLatestStatus: null,
        configIds: new Set(),
        results: [],
      });
    }
    return cases.get(id);
  };

  // 1. Seed from the roster so linked-but-never-executed cases still appear.
  //    The roster returns one row per (test case, configuration), so rows get merged here.
  for (const row of roster) {
    const id = row?.identifier ?? row?.test_case_identifier;
    if (!id) continue;
    const entry = ensure(String(id));
    entry.title ||= row.name ?? row.title ?? '';
    entry.priority ??= row.priority ?? null;
    entry.caseType ??= row.case_type ?? null;
    if (row.latest_status != null) entry.apiLatestStatus = row.latest_status;
    if (row.configuration_id != null) entry.configIds.add(String(row.configuration_id));
  }

  // 2. Attach every result to its test case. A result whose test case is absent from the roster
  //    is still kept — the run executed it, so hiding it would understate coverage.
  for (const result of results) {
    const id = readTestCaseId(result);
    if (!id) continue;
    const entry = ensure(id);
    const configId = result.configuration_id == null ? null : String(result.configuration_id);
    if (configId) entry.configIds.add(configId);
    entry.results.push({
      id: result.id ?? null,
      status: normalizeStatus(readStatus(result)),
      _timestamp: readTimestamp(result),
      timestamp: readTimestamp(result),
      configId,
      configLabel: configId ? (configLabels.get(configId) ?? `Config ${configId}`) : 'Not specified',
      description: (result.description ?? '').toString().trim(),
      issues: Array.isArray(result.issues) ? result.issues : [],
      executionId: readExecutionId(result),
      url: readResultUrl(result),
      // Set by the caller when several test runs of one build are merged, so a result can be
      // traced back to the run it came from.
      runId: result.__runId ?? result.test_run_id ?? null,
    });
  }

  // 3. Index automation-test executions. Each `execution_id` is one `it` block run; ordinals are
  //    assigned by first-seen time so "#1" is the test that ran first. Knowing which test cases
  //    shared an execution is what makes the many-to-many mapping legible in the report.
  const executions = new Map();
  for (const entry of cases.values()) {
    for (const result of entry.results) {
      if (!result.executionId) continue;
      if (!executions.has(result.executionId)) {
        executions.set(result.executionId, {
          id: result.executionId, firstSeen: result._timestamp ?? Infinity, testCaseIds: new Set(),
        });
      }
      const execution = executions.get(result.executionId);
      execution.testCaseIds.add(entry.id);
      execution.firstSeen = Math.min(execution.firstSeen, result._timestamp ?? Infinity);
    }
  }
  [...executions.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .forEach((execution, index) => { execution.ordinal = index + 1; });

  const describeExecution = (entryId, executionId) => {
    const execution = executionId ? executions.get(executionId) : null;
    if (!execution) return null;
    return {
      id: execution.id,
      shortId: execution.id.slice(0, 8),
      ordinal: execution.ordinal,
      // Sibling test cases set by the same `it` block — the many-to-many link, made visible.
      alsoCovered: [...execution.testCaseIds].filter((id) => id !== entryId).sort(compareIdentifiers),
    };
  };

  // 4. Resolve each test case to its latest result.
  const configsUsed = new Set();
  const testCases = [];
  let disagreementCount = 0;

  for (const entry of cases.values()) {
    entry.results.sort(compareRecencyDesc);
    const winner = entry.results[0] ?? null;
    const status = winner ? winner.status : normalizeStatus(entry.apiLatestStatus);

    // Cross-check our ordering against the status the API itself reports for the run.
    const apiStatus = entry.apiLatestStatus ? normalizeStatus(entry.apiLatestStatus) : null;
    const disagrees = Boolean(
      winner && apiStatus && apiStatus.key !== 'untested' && apiStatus.key !== status.key,
    );
    if (disagrees) disagreementCount++;

    for (const configId of entry.configIds) configsUsed.add(configId);

    testCases.push({
      id: entry.id,
      title: entry.title,
      priority: entry.priority,
      caseType: entry.caseType,
      status,
      winningConfig: winner?.configLabel ?? null,
      lastRunAt: winner?.timestamp ?? null,
      resultCount: entry.results.length,
      contributingConfigs: [...entry.configIds].map((c) => configLabels.get(c) ?? `Config ${c}`),
      executionCount: new Set(entry.results.map((r) => r.executionId).filter(Boolean)).size,
      winningRunId: winner?.runId ?? null,
      results: entry.results.map(({ _timestamp, executionId, ...rest }) => ({
        ...rest, execution: describeExecution(entry.id, executionId),
      })),
      apiLatestStatus: entry.apiLatestStatus,
      disagrees,
    });
  }

  // Failures first, then by test case id so the report opens on what needs attention.
  testCases.sort((a, b) =>
    a.status.rank - b.status.rank || compareIdentifiers(a.id, b.id));

  const totals = { total: testCases.length };
  for (const testCase of testCases) {
    totals[testCase.status.key] = (totals[testCase.status.key] ?? 0) + 1;
  }
  const executed = totals.total - (totals.untested ?? 0);
  totals.executed = executed;
  totals.passRate = executed > 0 ? Math.round(((totals.passed ?? 0) / executed) * 1000) / 10 : null;

  return {
    testCases,
    totals,
    configsUsed: [...configsUsed].map((c) => configLabels.get(c) ?? `Config ${c}`).sort(),
    disagreementCount,
    executionCount: executions.size,
    // More than one means a build's re-runs were merged; the report then shows a Test run column.
    runIdsPresent: [...new Set(testCases.flatMap((tc) => tc.results.map((r) => r.runId)).filter(Boolean))],
    // SDK-created runs leave `description` null; the report drops that column when it is all empty.
    hasDescriptions: testCases.some((tc) => tc.results.some((r) => r.description)),
  };
}

/** Sorts TC-9 before TC-10 rather than lexicographically. */
function compareIdentifiers(a, b) {
  const numA = Number(String(a).replace(/\D/g, ''));
  const numB = Number(String(b).replace(/\D/g, ''));
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
  return String(a).localeCompare(String(b));
}
