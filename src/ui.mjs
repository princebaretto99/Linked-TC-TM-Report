/**
 * The app shell served at `/`. Vanilla JS, no build step, no dependencies.
 *
 * The report itself is NOT re-implemented here — the shell fetches the exact HTML that
 * `renderHtml` produces and drops it into an iframe, so what you look at and what you download
 * are the same bytes. One renderer, no drift.
 */
/**
 * BrowserStack's own mark, taken from their site's logo SVG (the wordmark half is hard-coded
 * white, so only the mark is used and "BrowserStack" is set as themeable text beside it).
 * Inlined so the page needs no network access.
 */
const BSTACK_MARK = `<svg viewBox="0 0 31.04 31.04" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BrowserStack"><g fill="none" fill-rule="evenodd"><g><path d="m31.0344828 15.5172414c0 8.5701882-6.9470532 15.5172414-15.5172414 15.5172414-8.56989423 0-15.5172414-6.9470532-15.5172414-15.5172414 0-8.56989423 6.94734717-15.5172414 15.5172414-15.5172414 8.5701882 0 15.5172414 6.94734717 15.5172414 15.5172414" fill="#ecb360"></path><path d="m26.8965517 13.9655172c0 7.7128847-6.0213369 13.9655173-13.4482758 13.9655173-7.42722227 0-13.4482759-6.2526326-13.4482759-13.9655173 0-7.71288459 6.02105363-13.9655172 13.4482759-13.9655172 7.4269389 0 13.4482758 6.25263261 13.4482758 13.9655172" fill="#d76835"></path><path d="m27.9310345 12.4136422c0 6.8560652-5.3263006 12.413944-11.8969855 12.413944-6.5698174 0-11.89611797-5.5578788-11.89611797-12.413944 0-6.85576335 5.32630057-12.4136422 11.89611797-12.4136422 6.5706849 0 11.8969855 5.55787885 11.8969855 12.4136422" fill="#d33a41"></path><path d="m26.8965517 13.4484262c0 6.2843054-4.8632703 11.37916-10.8622124 11.37916-5.9989422 0-10.86192551-5.0948546-10.86192551-11.37916 0-6.28490677 4.86298331-11.37946068 10.86192551-11.37946068 5.9989421 0 10.8622124 5.09455391 10.8622124 11.37946068" fill="#b6cb46"></path><path d="m25.862069 14.4826111c0 5.7133106-4.6316645 10.3449751-10.3449751 10.3449751-5.71301565 0-10.34468011-4.6316645-10.34468011-10.3449751 0-5.71331065 4.63166446-10.34468007 10.34468011-10.34468007 5.7133106 0 10.3449751 4.63136942 10.3449751 10.34468007" fill="#66ad4a"></path><path d="m21.7241379 12.4137931c0 4.5706247-3.7052373 8.2758621-8.275862 8.2758621-4.57090515 0-8.27586211-3.7052374-8.27586211-8.2758621 0-4.57062469 3.70495696-8.27586207 8.27586211-8.27586207 4.5706247 0 8.275862 3.70523738 8.275862 8.27586207" fill="#aed7dc"></path><path d="m22.7586207 11.3793103c0 3.9991764-3.2419755 7.2413794-7.2415259 7.2413794-3.9995505 0-7.24123273-3.242203-7.24123273-7.2413794 0-3.99946945 3.24168223-7.24137927 7.24123273-7.24137927 3.9995504 0 7.2415259 3.24190982 7.2415259 7.24137927" fill="#5bb1cf"></path><path d="m22.7586207 11.8963967c0 3.7136422-2.7788402 6.724293-6.2068966 6.724293s-6.2068965-3.0106508-6.2068965-6.724293c0-3.71333217 2.7788401-6.72398291 6.2068965-6.72398291s6.2068966 3.01065074 6.2068966 6.72398291" fill="#25a8c3"></path><path d="m20.6896552 12.9308813c0 3.1423524-2.315869 5.6898084-5.1725531 5.6898084-2.8564055 0-5.1722745-2.547456-5.1722745-5.6898084 0-3.14235241 2.315869-5.68950199 5.1722745-5.68950199 2.8566841 0 5.1725531 2.54714958 5.1725531 5.68950199"></path><path d="m15.5171021 18.6206897c-2.8564055 0-5.1722745-2.547456-5.1722745-5.6898084 0-3.14235241 2.315869-5.68950199 5.1722745-5.68950199 2.8566841 0 5.1725531 2.54714958 5.1725531 5.68950199 0 3.1423524-2.315869 5.6898084-5.1725531 5.6898084z" fill="#1b1a18"></path><path d="m18.3395432 11.2904163c-.4920811.8231975-1.4595626 1.299291-2.16129 1.062668-.7017274-.2363383-.8715674-1.0956984-.3798654-1.9191807.4920811-.82348231 1.4595626-1.29929107 2.16129-1.06295279s.8715674 1.09569839.3798654 1.91946549" fill="#fffffe"></path></g></g></svg>`;

export function renderApp() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test Case Status Reports</title>
<style>${STYLES}</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <span class="brand-mark">${BSTACK_MARK}</span>
    <span class="brand-name">BrowserStack</span>
    <span class="brand-sep" aria-hidden="true"></span>
    <span>Test case&#8209;level status reports</span>
  </div>
  <div class="topbar-controls">
    <label class="field">
      <span class="field-label">Project</span>
      <select id="project" disabled><option>Loading&hellip;</option></select>
    </label>
    <button id="refresh" class="btn" title="Re-fetch from BrowserStack, bypassing the cache">Refresh</button>
  </div>
</header>

<div class="layout">
  <aside class="sidebar" aria-label="Builds">
    <div class="sidebar-head">
      <input type="search" id="run-search" placeholder="Filter builds&hellip;" aria-label="Filter builds" disabled>
      <p class="sidebar-count" id="run-count"></p>
    </div>
    <ul class="runs" id="runs" role="list"></ul>
  </aside>

  <main class="content">
    <div class="content-bar" id="content-bar" hidden>
      <div class="content-title">
        <strong id="current-run-name"></strong>
        <span class="mono muted" id="current-run-id"></span>
        <span class="merge-note" id="merge-note"></span>
      </div>
      <div class="content-actions">
        <span class="fetched" id="fetched" title="When this report was fetched from BrowserStack"></span>
        <span class="saved" id="saved" hidden></span>
        <button class="btn" id="save">Save to reports/</button>
        <a class="btn" id="download" download>Download HTML</a>
        <a class="btn" id="raw" target="_blank" rel="noopener">JSON</a>
      </div>
    </div>
    <div class="stage" id="stage">
      <div class="placeholder" id="placeholder">
        <p class="placeholder-title">Pick a build</p>
        <p>Choose a project above, then a build from the list to see its test case&#8209;level report.
           Builds that were re-run are reported as one, with all their runs merged.</p>
      </div>
    </div>
  </main>
</div>

<script>${SCRIPT}</script>
</body>
</html>`;
}

const STYLES = `
:root {
  --bg: #f2f4f7; --surface: #ffffff; --sunken: #f7f8fa; --border: #dfe3e8;
  --text: #16191d; --muted: #6b7280; --accent: #1a56db; --accent-soft: #e8efff;
  --pass: #067647; --fail: #b42318; --danger-bg: #fdeceb; --danger-border: #f0b4ae;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101317; --surface: #1a1d22; --sunken: #14171b; --border: #2b3037;
    --text: #e8eaed; --muted: #98a1ab; --accent: #7aa5ff; --accent-soft: #1b2740;
    --pass: #5cd39a; --fail: #ff8b80; --danger-bg: #2d1614; --danger-border: #5c2a25;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--text); overflow: hidden;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; }
.muted { color: var(--muted); }

.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
  padding: 10px 18px; background: var(--surface); border-bottom: 1px solid var(--border);
}
.brand { display: flex; align-items: center; gap: 9px; font-weight: 600; }
.brand-mark { display: inline-flex; width: 22px; height: 22px; flex: none; }
.brand-mark svg { width: 100%; height: 100%; display: block; }
.brand-name { font-weight: 700; letter-spacing: -.01em; }
.brand-sep { width: 1px; height: 16px; background: var(--border); margin: 0 3px; }
.topbar-controls { display: flex; align-items: flex-end; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 3px; }
.field-label { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
select, input[type="search"] {
  font: inherit; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 9px;
}
select { min-width: 230px; }
select:disabled, input:disabled { opacity: .55; }

.btn {
  font: inherit; font-size: 13px; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px;
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; white-space: nowrap;
}
.btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn:disabled { opacity: .45; cursor: default; }

.layout { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 53px); }
.sidebar { background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.sidebar-head { padding: 12px 14px 8px; border-bottom: 1px solid var(--border); }
.sidebar-head input { width: 100%; }
.sidebar-count { margin: 7px 0 0; font-size: 11.5px; color: var(--muted); }

.runs { list-style: none; margin: 0; padding: 6px; overflow-y: auto; flex: 1; min-height: 0; }
.run {
  width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: none; border: 1px solid transparent; border-radius: 7px; padding: 9px 11px; display: block;
}
.run:hover { background: var(--sunken); }
.run.is-active { background: var(--accent-soft); border-color: var(--accent); }
.run-name { font-weight: 550; display: block; margin-bottom: 3px; word-break: break-word; }
.run-meta { display: flex; flex-wrap: wrap; gap: 4px 9px; font-size: 11.5px; color: var(--muted); }
.run-state {
  text-transform: uppercase; letter-spacing: .04em; font-size: 10px; font-weight: 600;
  border: 1px solid var(--border); border-radius: 3px; padding: 0 4px;
}
.runs-empty { padding: 22px 14px; color: var(--muted); font-size: 13px; text-align: center; }

.content { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.content-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  padding: 9px 16px; background: var(--surface); border-bottom: 1px solid var(--border);
}
.content-title { display: flex; align-items: baseline; gap: 9px; min-width: 0; }
.content-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.content-actions { display: flex; align-items: center; gap: 8px; }
.saved { font-size: 12px; color: var(--pass); }
.fetched { font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.rerun-badge {
  font-size: 10px; letter-spacing: .03em; font-weight: 650; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 3px; padding: 0 4px; vertical-align: 1px;
}
.merge-note { font-size: 12px; color: var(--muted); white-space: nowrap; }

.stage { flex: 1; position: relative; min-height: 0; background: var(--bg); }
.stage iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--bg); }

.placeholder, .state {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px; text-align: center; padding: 30px; color: var(--muted);
}
.placeholder-title { font-size: 16px; font-weight: 600; color: var(--text); margin: 0; }
.placeholder p, .state p { margin: 0; max-width: 380px; }

.spinner {
  width: 26px; height: 26px; border: 2.5px solid var(--border); border-top-color: var(--accent);
  border-radius: 50%; animation: spin .7s linear infinite; margin-bottom: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }

.error {
  background: var(--danger-bg); border: 1px solid var(--danger-border); border-radius: 8px;
  padding: 16px 18px; max-width: 620px; text-align: left; color: var(--text);
}
.error h2 { margin: 0 0 7px; font-size: 15px; color: var(--fail); }
.error pre {
  margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--muted);
}

@media (max-width: 800px) {
  body { overflow: auto; }
  .layout { grid-template-columns: 1fr; height: auto; }
  .sidebar { border-right: 0; border-bottom: 1px solid var(--border); }
  .runs { max-height: 260px; }
  .stage { height: 78vh; }
}
`;

const SCRIPT = `
(function () {
  var el = function (id) { return document.getElementById(id); };
  var projectSelect = el('project'), buildList = el('runs'), buildSearch = el('run-search');
  var buildCount = el('run-count'), stage = el('stage'), contentBar = el('content-bar');
  var savedNote = el('saved'), refreshBtn = el('refresh'), saveBtn = el('save');

  var builds = [];
  var selectedBuild = null;   // build name
  var requestToken = 0;       // guards against a slow response overwriting a newer selection

  function projectId() { return projectSelect.value; }

  async function getJson(url, options) {
    var response = await fetch(url, options);
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || ('HTTP ' + response.status));
    return body;
  }

  function showState(html) { stage.innerHTML = html; }
  function showSpinner(message) {
    showState('<div class="state"><div class="spinner"></div><p>' + escapeHtml(message) + '</p></div>');
  }
  function showError(title, detail) {
    showState('<div class="state"><div class="error"><h2>' + escapeHtml(title) +
              '</h2><pre>' + escapeHtml(detail) + '</pre></div></div>');
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortDate(iso) {
    var ms = Date.parse(iso || '');
    if (isNaN(ms)) return '';
    return new Date(ms).toLocaleString(undefined,
      { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function renderBuilds() {
    var query = buildSearch.value.trim().toLowerCase();
    var matches = builds.filter(function (build) {
      if (!query) return true;
      return (build.name + ' ' + build.runIds.join(' ')).toLowerCase().indexOf(query) !== -1;
    });

    buildCount.textContent = matches.length === builds.length
      ? builds.length + ' build' + (builds.length === 1 ? '' : 's')
      : matches.length + ' of ' + builds.length + ' builds';

    if (matches.length === 0) {
      buildList.innerHTML = '<li class="runs-empty">' +
        (builds.length ? 'No builds match that filter.' : 'This project has no test runs.') + '</li>';
      return;
    }

    buildList.innerHTML = matches.map(function (build) {
      var reran = build.runIds.length > 1;
      var meta = [build.runIds.join(', ')];
      var when = shortDate(build.lastAt);
      if (when) meta.push(when);
      return '<li><button class="run' + (selectedBuild === build.key ? ' is-active' : '') +
        '" data-build="' + escapeHtml(build.key) + '">' +
        '<span class="run-name">' + escapeHtml(build.name) +
          (reran ? ' <span class="rerun-badge">' + build.runIds.length + ' runs</span>' : '') +
        '</span>' +
        '<span class="run-meta">' +
          (build.runState ? '<span class="run-state">' + escapeHtml(build.runState) + '</span>' : '') +
          meta.map(function (m) { return '<span>' + escapeHtml(m) + '</span>'; }).join('') +
        '</span></button></li>';
    }).join('');
  }

  async function loadProjects() {
    try {
      var data = await getJson('/api/projects');
      if (!data.projects.length) {
        projectSelect.innerHTML = '<option>No projects</option>';
        return showError('No projects', 'This account has no visible Test Management projects.');
      }
      projectSelect.innerHTML = data.projects.map(function (project) {
        return '<option value="' + escapeHtml(project.identifier) + '">' +
          escapeHtml((project.name || project.identifier) + '  (' + project.identifier + ')') + '</option>';
      }).join('');
      projectSelect.disabled = false;

      var params = new URLSearchParams(location.search);
      var wanted = params.get('project');
      if (wanted && data.projects.some(function (p) { return p.identifier === wanted; })) {
        projectSelect.value = wanted;
      }
      await loadBuilds();
      // Deep links accept a build name, or a run id which resolves to the build containing it.
      if (params.get('build')) selectBuild(params.get('build'));
      else if (params.get('run')) selectByRunId(params.get('run'));
    } catch (error) {
      projectSelect.innerHTML = '<option>Unavailable</option>';
      showError('Could not load projects', error.message);
    }
  }

  async function loadBuilds() {
    buildList.innerHTML = '';
    buildCount.textContent = 'Loading…';
    buildSearch.disabled = true;
    try {
      var data = await getJson('/api/builds?project=' + encodeURIComponent(projectId()));
      builds = data.builds || [];
      buildSearch.disabled = false;
      renderBuilds();
    } catch (error) {
      buildCount.textContent = '';
      buildList.innerHTML = '<li class="runs-empty">Could not load builds.</li>';
      showError('Could not load builds', error.message);
    }
  }

  /** A run id selects the whole build it belongs to. */
  function selectByRunId(runId) {
    var owner = builds.filter(function (b) { return b.runIds.indexOf(runId) !== -1; })[0];
    if (owner) return selectBuild(owner.key);
    // Not in any listed build — let the server resolve it directly.
    return selectBuild(null, runId);
  }

  async function selectBuild(buildName, runId, force) {
    var build = buildName
      ? builds.filter(function (b) { return b.key === buildName; })[0]
      : null;

    selectedBuild = build ? build.key : null;
    renderBuilds();

    el('current-run-name').textContent = build ? build.name : (buildName || runId);
    el('current-run-id').textContent = build ? build.runIds.join(', ') : (runId || '');
    el('merge-note').textContent = build && build.runIds.length > 1
      ? '· ' + build.runIds.length + ' runs merged' : '';
    contentBar.hidden = false;
    savedNote.hidden = true;

    var query = 'project=' + encodeURIComponent(projectId()) +
      (buildName ? '&build=' + encodeURIComponent(buildName) : '&run=' + encodeURIComponent(runId));
    el('download').href = '/api/report?' + query + '&download=1';
    el('raw').href = '/api/report?' + query + '&format=json';
    history.replaceState(null, '', '?' + query);

    var token = ++requestToken;
    el('fetched').textContent = '';
    showSpinner('Fetching live results for ' + (build ? build.name : (buildName || runId)) + '…');
    try {
      var response = await fetch('/api/report?' + query + (force ? '&refresh=1' : ''));
      var text = await response.text();
      if (token !== requestToken) return;   // a newer selection already won
      if (!response.ok) {
        var message = text;
        try { message = JSON.parse(text).error || text; } catch (e) {}
        return showError('Could not build the report', message);
      }
      var frame = document.createElement('iframe');
      frame.setAttribute('title', 'Report for ' + (build ? build.name : runId));
      frame.srcdoc = text;
      stage.innerHTML = '';
      stage.appendChild(frame);
      el('fetched').textContent = 'Fetched ' + new Date().toLocaleTimeString();
    } catch (error) {
      if (token === requestToken) showError('Could not build the report', error.message);
    }
  }

  buildList.addEventListener('click', function (event) {
    var button = event.target.closest('.run');
    if (button) selectBuild(button.dataset.build);
  });
  buildSearch.addEventListener('input', renderBuilds);

  projectSelect.addEventListener('change', function () {
    selectedBuild = null;
    contentBar.hidden = true;
    showState('<div class="placeholder"><p class="placeholder-title">Pick a build</p>' +
              '<p>Choose a build from the list to see its test case-level report.</p></div>');
    loadBuilds();
  });

  refreshBtn.addEventListener('click', async function () {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    try {
      await loadBuilds();
      if (selectedBuild) await selectBuild(selectedBuild, null, true);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }
  });

  saveBtn.addEventListener('click', async function () {
    if (!selectedBuild) return;
    saveBtn.disabled = true;
    savedNote.hidden = true;
    try {
      var data = await getJson('/api/save?project=' + encodeURIComponent(projectId()) +
                               '&build=' + encodeURIComponent(selectedBuild), { method: 'POST' });
      savedNote.textContent = '✔ ' + data.path;
      savedNote.hidden = false;
    } catch (error) {
      savedNote.textContent = '✖ ' + error.message;
      savedNote.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  loadProjects();
})();
`;
