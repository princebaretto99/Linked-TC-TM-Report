/** Renders the aggregated model as one self-contained HTML file (no external requests). */

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

const formatTime = (ms) => {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const TM_BASE = 'https://test-management.browserstack.com';

const plural = (count, noun) => `${noun}${count === 1 ? '' : 's'}`;

export function renderHtml({ project, build, model, generatedAt = Date.now() }) {
  const { testCases, totals, configsUsed, disagreementCount, executionCount, hasDescriptions } = model;
  const projectId = project?.identifier ?? '';
  const buildName = build?.name ?? '';
  const runs = build?.runs ?? [];
  // Several runs means a build's re-runs were merged; results then need a Test run column.
  const merged = runs.length > 1;

  const tiles = [
    ...(executionCount ? [{ label: plural(executionCount, 'Automation test'), value: executionCount, key: 'all' }] : []),
    { label: plural(totals.total, 'Linked test case'), value: totals.total, key: 'all' },
    { label: 'Passed', value: totals.passed ?? 0, key: 'passed' },
    { label: 'Failed', value: totals.failed ?? 0, key: 'failed' },
    { label: 'Skipped', value: totals.skipped ?? 0, key: 'skipped' },
    { label: 'Untested', value: totals.untested ?? 0, key: 'untested' },
    { label: 'Pass rate', value: totals.passRate == null ? '—' : `${totals.passRate}%`, key: 'all' },
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(buildName)} — Test Case Status</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <header class="page-head">
    <p class="eyebrow">Test case&#8209;level status report</p>
    <h1>${escapeHtml(buildName || 'Build')}</h1>
    <dl class="meta">
      ${metaItem('Project', `${escapeHtml(project?.name || projectId)}${projectId ? ` <span class="mono">${escapeHtml(projectId)}</span>` : ''}`)}
      ${metaItem(plural(runs.length, 'Test run'), runs.length
        ? runs.map((r) => `<span class="mono">${escapeHtml(r.identifier)}</span>`).join(', ')
        : '—')}
      ${metaItem('State', escapeHtml(build?.runState ?? '—'))}
      ${metaItem('Configurations', configsUsed.length ? escapeHtml(configsUsed.join(' · ')) : '—')}
      ${metaItem('Generated', escapeHtml(formatTime(generatedAt)))}
    </dl>
  </header>

  ${merged ? `<p class="merged" role="status">
    This build ran <strong>${runs.length} times</strong>. All of their results are merged below, so
    each test case shows the status from whichever run touched it last — a re-run that fixed a
    failure is reflected here.
    ${runs.map((r) => `<span class="run-chip"><span class="mono">${escapeHtml(r.identifier)}</span>
      ${escapeHtml(formatTime(Date.parse(r.created_at) || null))}
      · ${r.resultCount} result${r.resultCount === 1 ? '' : 's'}</span>`).join('')}
  </p>` : ''}

  <p class="rule-note">
    Each test case shows the <strong>chronologically latest result</strong> posted against it in this
    build &mdash; across every test run of the build, every automation test linked to it, every
    configuration, and every retry. Expand a row to see all contributing results.
  </p>

  ${disagreementCount > 0 ? `<p class="warn" role="status">
    <strong>${disagreementCount}</strong> test case${disagreementCount === 1 ? '' : 's'} resolved to a
    status that differs from the API's own <span class="mono">latest_status</span> field. Those rows are
    marked &#9888; below &mdash; worth a look before trusting them.
  </p>` : ''}

  <section class="tiles" aria-label="Summary">
    ${tiles.map((tile) => `<div class="tile tile--${tile.key}">
      <span class="tile-value">${escapeHtml(tile.value)}</span>
      <span class="tile-label">${escapeHtml(tile.label)}</span>
    </div>`).join('\n    ')}
  </section>

  <section class="controls">
    <input type="search" id="search" placeholder="Filter by test case ID or title&hellip;" aria-label="Search test cases">
    <div class="chips" role="group" aria-label="Filter by status">
      ${['all', 'failed', 'passed', 'skipped', 'blocked', 'untested', 'other']
        .filter((key) => key === 'all' || (totals[key] ?? 0) > 0)
        .map((key) => `<button class="chip${key === 'all' ? ' is-active' : ''}" data-status="${key}">${
          key === 'all' ? 'All' : escapeHtml(key[0].toUpperCase() + key.slice(1))
        }${key === 'all' ? '' : ` <span class="chip-count">${totals[key] ?? 0}</span>`}</button>`).join('\n      ')}
    </div>
  </section>

  <table class="results">
    <thead>
      <tr>
        <th scope="col" class="col-toggle"><span class="sr-only">Expand</span></th>
        <th scope="col">Test case</th>
        <th scope="col">Title</th>
        <th scope="col">Latest status</th>
        <th scope="col">Configuration</th>
        <th scope="col">Last result</th>
      </tr>
    </thead>
    <tbody>
      ${testCases.map((testCase, index) => renderRow(testCase, index, projectId, hasDescriptions, merged)).join('\n      ')}
    </tbody>
  </table>
  <p class="empty" id="empty" hidden>No test cases match the current filter.</p>

  <footer>
    <p>${totals.total} linked test case${totals.total === 1 ? '' : 's'} &middot;
       ${totals.executed} executed &middot;
       generated from the BrowserStack Test Management API.</p>
  </footer>
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}

function metaItem(label, valueHtml) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

function renderRow(testCase, index, projectId, hasDescriptions, merged) {
  const rowId = `detail-${index}`;
  const hasDetail = testCase.results.length > 0;
  const searchKey = escapeHtml(`${testCase.id} ${testCase.title}`.toLowerCase());
  const caseUrl = projectId
    ? `${TM_BASE}/projects/${encodeURIComponent(projectId)}/test-cases/${encodeURIComponent(testCase.id)}`
    : null;

  const detail = hasDetail ? `
      <tr class="detail" id="${rowId}" hidden data-status="${escapeHtml(testCase.status.key)}" data-search="${searchKey}">
        <td colspan="6">
          <p class="detail-head">${testCase.results.length} result${testCase.results.length === 1 ? '' : 's'} in this build, newest first${
            testCase.results.length > 1 ? ' — the newest one sets the status above' : ''}</p>
          <table class="detail-table">
            <thead><tr>
              <th scope="col">When</th>
              <th scope="col">Status</th>
              <th scope="col">Configuration</th>
              <th scope="col">Automation test</th>
              ${merged ? '<th scope="col">Test run</th>' : ''}
              ${hasDescriptions ? '<th scope="col">Notes</th>' : ''}
            </tr></thead>
            <tbody>
              ${testCase.results.map((result, resultIndex) => `<tr${resultIndex === 0 ? ' class="winner"' : ''}>
                <td class="nowrap">${result.url
                  ? `<a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">${escapeHtml(formatTime(result.timestamp))}</a>`
                  : escapeHtml(formatTime(result.timestamp))}${resultIndex === 0 ? ' <span class="tag">latest</span>' : ''}</td>
                <td>${statusPill(result.status)}</td>
                <td>${escapeHtml(result.configLabel)}</td>
                <td>${renderExecution(result.execution)}</td>
                ${merged ? `<td class="mono nowrap">${escapeHtml(result.runId ?? '—')}</td>` : ''}
                ${hasDescriptions
                  ? `<td class="detail-desc">${result.description ? escapeHtml(result.description) : '<span class="muted">—</span>'}</td>`
                  : ''}
              </tr>`).join('\n              ')}
            </tbody>
          </table>
        </td>
      </tr>` : '';

  return `<tr class="row" data-status="${escapeHtml(testCase.status.key)}" data-search="${searchKey}">
        <td class="col-toggle">${hasDetail
          ? `<button class="toggle" aria-expanded="false" aria-controls="${rowId}"><span class="sr-only">Show results for ${escapeHtml(testCase.id)}</span><span class="caret" aria-hidden="true">&#9656;</span></button>`
          : ''}</td>
        <td class="mono nowrap">${caseUrl
          ? `<a href="${escapeHtml(caseUrl)}" target="_blank" rel="noopener">${escapeHtml(testCase.id)}</a>`
          : escapeHtml(testCase.id)}${testCase.disagrees ? ' <span class="flag" title="Derived status differs from the API latest_status field">&#9888;</span>' : ''}</td>
        <td>${escapeHtml(testCase.title || '—')}${testCase.executionCount > 1
          ? ` <span class="via">via ${testCase.executionCount} automation tests</span>` : ''}</td>
        <td>${statusPill(testCase.status)}</td>
        <td>${escapeHtml(testCase.winningConfig ?? '—')}${
          testCase.contributingConfigs.length > 1
            ? ` <span class="muted">(+${testCase.contributingConfigs.length - 1} more)</span>` : ''}${
          merged && testCase.winningRunId
            ? `<span class="from-run mono">from ${escapeHtml(testCase.winningRunId)}</span>` : ''}</td>
        <td class="nowrap">${escapeHtml(formatTime(testCase.lastRunAt))}</td>
      </tr>${detail}`;
}

/**
 * Names the `it` block behind a result. There is no test name in the payload, so the execution's
 * ordinal plus its short id is the identity — and `alsoCovered` is the part that matters: it shows
 * the other test cases this same automation test set, which is the many-to-many link in action.
 */
function renderExecution(execution) {
  if (!execution) return '<span class="muted">—</span>';
  const siblings = execution.alsoCovered.length
    ? `<span class="also">also set ${execution.alsoCovered.map(escapeHtml).join(', ')}</span>`
    : '';
  return `<span class="exec" title="execution ${escapeHtml(execution.id)}">#${execution.ordinal}` +
         `<span class="exec-id">${escapeHtml(execution.shortId)}</span></span>${siblings}`;
}

function statusPill(status) {
  return `<span class="pill pill--${escapeHtml(status.key)}"><span class="pill-icon" aria-hidden="true">${escapeHtml(status.icon)}</span>${escapeHtml(status.label)}</span>`;
}

const STYLES = `
:root {
  --bg: #f7f8fa; --surface: #ffffff; --border: #e3e6ea; --text: #16191d; --muted: #6b7280;
  --accent: #1a56db; --pass: #067647; --pass-bg: #e7f6ee; --fail: #b42318; --fail-bg: #fdeceb;
  --skip: #8a5a00; --skip-bg: #fdf3e2; --untested: #5b6470; --untested-bg: #eef0f3;
  --warn-bg: #fff8e6; --warn-border: #e3bb61; --accent-soft: #eef3ff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a; --surface: #1c1f24; --border: #2c3138; --text: #e8eaed; --muted: #9aa3ad;
    --accent: #7aa5ff; --pass: #5cd39a; --pass-bg: #10281e; --fail: #ff8b80; --fail-bg: #2d1614;
    --skip: #e9be6a; --skip-bg: #2b2213; --untested: #9aa3ad; --untested-bg: #23272d;
    --warn-bg: #2a2313; --warn-border: #6b5624; --accent-soft: #18203050;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
main { max-width: 1200px; margin: 0 auto; padding: 32px 20px 64px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; }
.muted { color: var(--muted); }
.nowrap { white-space: nowrap; }
a { color: var(--accent); }

.page-head { margin-bottom: 24px; }
.eyebrow { margin: 0 0 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 0 0 16px; font-size: 26px; line-height: 1.25; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 0; }
.meta div { min-width: 0; }
.meta dt { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.meta dd { margin: 2px 0 0; }

.rule-note {
  background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--accent);
  border-radius: 6px; padding: 12px 14px; margin: 0 0 16px; color: var(--muted); font-size: 14px;
}
.rule-note strong { color: var(--text); }
.warn {
  background: var(--warn-bg); border: 1px solid var(--warn-border); border-radius: 6px;
  padding: 12px 14px; margin: 0 0 16px; font-size: 14px;
}

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
.tile {
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;
}
.tile-value { font-size: 26px; font-weight: 650; font-variant-numeric: tabular-nums; }
.tile-label { font-size: 12px; color: var(--muted); }
.tile--passed .tile-value { color: var(--pass); }
.tile--failed .tile-value { color: var(--fail); }
.tile--skipped .tile-value { color: var(--skip); }

.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
#search {
  flex: 1 1 260px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--text); font: inherit; font-size: 14px;
}
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  border-radius: 999px; padding: 7px 13px; font: inherit; font-size: 13px; cursor: pointer;
}
.chip:hover { border-color: var(--accent); }
.chip.is-active { background: var(--accent); border-color: var(--accent); color: #fff; }
.chip-count { opacity: .7; font-variant-numeric: tabular-nums; }

table.results {
  width: 100%; border-collapse: collapse; background: var(--surface);
  border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
}
table.results th, table.results td { padding: 11px 14px; text-align: left; vertical-align: top; }
table.results thead th {
  font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted);
  border-bottom: 1px solid var(--border); font-weight: 600; white-space: nowrap;
}
table.results tbody tr.row { border-top: 1px solid var(--border); }
table.results tbody tr.row:first-child { border-top: 0; }
.col-toggle { width: 34px; padding-right: 0 !important; }
.toggle { background: none; border: 0; cursor: pointer; color: var(--muted); padding: 2px 4px; font-size: 13px; }
.toggle[aria-expanded="true"] .caret { display: inline-block; transform: rotate(90deg); }
.caret { display: inline-block; transition: transform .12s ease; }
.flag { color: var(--skip); cursor: help; }

.pill {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
  font-size: 12.5px; font-weight: 600; white-space: nowrap;
  background: var(--untested-bg); color: var(--untested);
}
.pill-icon { font-size: 11px; }
.pill--passed { background: var(--pass-bg); color: var(--pass); }
.pill--failed { background: var(--fail-bg); color: var(--fail); }
.pill--skipped, .pill--blocked { background: var(--skip-bg); color: var(--skip); }

tr.detail > td { background: var(--bg); padding: 12px 14px 16px 46px; border-top: 1px dashed var(--border); }
.detail-head { margin: 0 0 8px; font-size: 12px; color: var(--muted); }
.detail-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.detail-table th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--muted); padding: 4px 10px 4px 0; font-weight: 600;
}
.detail-table td { padding: 5px 10px 5px 0; vertical-align: top; border-top: 1px solid var(--border); }
.detail-table tr.winner td { font-weight: 500; }
.detail-desc { white-space: pre-wrap; word-break: break-word; max-width: 620px; }
.tag {
  font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 3px; padding: 0 4px; vertical-align: 1px;
}

.merged {
  background: var(--accent-soft, var(--untested-bg)); border: 1px solid var(--border);
  border-left: 3px solid var(--accent); border-radius: 6px; padding: 12px 14px; margin: 0 0 16px;
  font-size: 14px; color: var(--muted);
}
.merged strong { color: var(--text); }
.run-chip {
  display: inline-flex; align-items: baseline; gap: 6px; margin: 8px 8px 0 0; padding: 2px 8px;
  border: 1px solid var(--border); border-radius: 999px; font-size: 12px; background: var(--surface);
  white-space: nowrap;
}
.from-run { display: block; font-size: 11px; color: var(--muted); margin-top: 3px; }

.exec {
  display: inline-flex; align-items: baseline; gap: 5px; font-weight: 600; font-size: 12px;
  background: var(--untested-bg); border-radius: 4px; padding: 1px 6px; white-space: nowrap;
}
.exec-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 400; opacity: .75; }
.also { display: block; font-size: 11.5px; color: var(--muted); margin-top: 3px; }
.via {
  font-size: 11.5px; color: var(--accent); border: 1px solid var(--accent); border-radius: 3px;
  padding: 0 4px; white-space: nowrap; margin-left: 4px;
}

.empty { text-align: center; color: var(--muted); padding: 32px 0; }
footer { margin-top: 20px; color: var(--muted); font-size: 13px; }

@media (max-width: 720px) {
  table.results thead { display: none; }
  table.results tbody tr.row { display: grid; grid-template-columns: 34px 1fr; gap: 0 8px; padding: 8px 0; }
  table.results tbody tr.row td { padding: 3px 14px 3px 0; }
  table.results tbody tr.row td.col-toggle { grid-row: span 5; padding-left: 10px !important; }
  tr.detail > td { padding-left: 14px; }
}
@media print {
  .controls, .toggle { display: none; }
  tr.detail[hidden] { display: table-row !important; }
  body { background: #fff; }
}
`;

const SCRIPT = `
(function () {
  var search = document.getElementById('search');
  var empty = document.getElementById('empty');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr.row'));
  var activeStatus = 'all';

  function detailFor(row) {
    var button = row.querySelector('.toggle');
    return button ? document.getElementById(button.getAttribute('aria-controls')) : null;
  }

  function apply() {
    var query = search.value.trim().toLowerCase();
    var visible = 0;
    rows.forEach(function (row) {
      var matchesStatus = activeStatus === 'all' || row.dataset.status === activeStatus;
      var matchesQuery = !query || row.dataset.search.indexOf(query) !== -1;
      var show = matchesStatus && matchesQuery;
      row.hidden = !show;
      if (show) visible++;
      var detail = detailFor(row);
      if (!detail) return;
      var button = row.querySelector('.toggle');
      var expanded = button && button.getAttribute('aria-expanded') === 'true';
      detail.hidden = !(show && expanded);
    });
    empty.hidden = visible > 0;
  }

  search.addEventListener('input', apply);
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (other) { other.classList.remove('is-active'); });
      chip.classList.add('is-active');
      activeStatus = chip.dataset.status;
      apply();
    });
  });

  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('.toggle') : null;
    if (!button) return;
    var detail = document.getElementById(button.getAttribute('aria-controls'));
    if (!detail) return;
    var expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    detail.hidden = expanded;
  });
})();
`;
