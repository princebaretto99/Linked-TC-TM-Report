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
      <select id="project" disabled><option value="">Loading&hellip;</option></select>
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
    <nav class="pager" id="pager" aria-label="Build list pages" hidden>
      <button class="btn pager-btn" id="prev-page" type="button" disabled>&lsaquo; Prev</button>
      <span class="pager-status" id="pager-status" aria-live="polite"></span>
      <button class="btn pager-btn" id="next-page" type="button" disabled>Next &rsaquo;</button>
    </nav>
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
        <p class="placeholder-title">Pick a project</p>
        <p>Choose a project above to list its builds, then pick one to see its test case&#8209;level
           report. Builds that were re-run are reported as one, with all their runs merged.</p>
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
.runs-loading {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  padding: 26px 14px; color: var(--muted); font-size: 13px;
}
.spinner-sm { width: 15px; height: 15px; border-width: 2px; margin: 0; flex: none; }

.pager {
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 8px 12px; border-top: 1px solid var(--border); background: var(--surface);
}
/* Same as .content-bar: an explicit guard, or display:flex wins over [hidden]. */
.pager[hidden] { display: none; }
.pager-btn { padding: 4px 9px; font-size: 12px; }
.pager-status { flex: 1; text-align: center; font-size: 11.5px; color: var(--muted); }

.content { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.content-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  padding: 9px 16px; background: var(--surface); border-bottom: 1px solid var(--border);
}
/* display:flex on the class outranks the UA stylesheet's [hidden]; say it explicitly. */
.content-bar[hidden] { display: none; }
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
  var pager = el('pager'), prevBtn = el('prev-page'), nextBtn = el('next-page');
  var pagerStatus = el('pager-status');

  // How many builds to show at a time. Purely a display size: the server holds the full list and
  // slices it in memory, so this changes how much is DRAWN, never how much is fetched — paging and
  // filtering cost no calls to BrowserStack at all.
  var PAGE_SIZE = 10;
  var SEARCH_DEBOUNCE_MS = 200;

  var builds = [];            // the current page only
  var paging = { page: 1, pageSize: PAGE_SIZE, totalPages: 1, total: 0, totalBuilds: 0, filtered: false };
  var selectedBuild = null;   // build name
  var requestToken = 0;       // guards against a slow response overwriting a newer selection
  var buildsToken = 0;        // ditto, for the build list: a fast page must not lose to a slow one
  var searchTimer = null;

  function projectId() { return projectSelect.value; }

  /** "Demo Project 1 (PR-24)" — the option text, minus the padding used to align the dropdown. */
  function projectLabel() {
    var option = projectSelect.options[projectSelect.selectedIndex];
    return option ? option.text.replace(/\s{2,}/g, ' ').trim() : '';
  }

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

  /** "1–30 of 142 builds", or "1–30 of 12 of 142 builds" collapsed sensibly when filtering. */
  function describeCount() {
    if (paging.total === 0) {
      return paging.filtered ? '0 of ' + paging.totalBuilds + ' builds' : '';
    }
    var scope = paging.filtered
      ? paging.total + ' of ' + paging.totalBuilds + ' builds'
      : paging.total + ' build' + (paging.total === 1 ? '' : 's');
    if (paging.totalPages <= 1) return scope;
    var first = (paging.page - 1) * paging.pageSize + 1;
    return first + '–' + (first + builds.length - 1) + ' of ' + scope;
  }

  function renderPager() {
    pager.hidden = paging.totalPages <= 1;
    prevBtn.disabled = paging.page <= 1;
    nextBtn.disabled = paging.page >= paging.totalPages;
    pagerStatus.textContent = 'Page ' + paging.page + ' of ' + paging.totalPages;
  }

  function renderBuilds() {
    buildCount.textContent = describeCount();
    renderPager();

    if (builds.length === 0) {
      buildList.innerHTML = '<li class="runs-empty">' +
        (paging.filtered ? 'No builds match that filter.' : 'This project has no test runs.') + '</li>';
      return;
    }

    buildList.innerHTML = builds.map(function (build) {
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

  /** Nothing is selected on arrival: listing a project's builds is expensive, so it waits to be asked. */
  function showNoProjectChosen() {
    builds = [];
    paging = { page: 1, pageSize: PAGE_SIZE, totalPages: 1, total: 0, totalBuilds: 0, filtered: false };
    buildCount.textContent = '';
    pager.hidden = true;
    buildSearch.disabled = true;
    buildList.innerHTML = '<li class="runs-empty">Select a project to list its builds.</li>';
  }

  async function loadProjects() {
    try {
      var data = await getJson('/api/projects');
      if (!data.projects.length) {
        projectSelect.innerHTML = '<option value="">No projects</option>';
        return showError('No projects', 'This account has no visible Test Management projects.');
      }
      // A valueless first option so the control genuinely starts empty — picking the first project
      // by default would fire a full run listing for a project nobody asked about.
      projectSelect.innerHTML = '<option value="">Select a project…</option>' +
        data.projects.map(function (project) {
          return '<option value="' + escapeHtml(project.identifier) + '">' +
            escapeHtml((project.name || project.identifier) + '  (' + project.identifier + ')') + '</option>';
        }).join('');
      projectSelect.disabled = false;

      var params = new URLSearchParams(location.search);
      var wanted = params.get('project');
      var deepLinked = wanted && data.projects.some(function (p) { return p.identifier === wanted; });
      if (!deepLinked) return showNoProjectChosen();

      // An explicit ?project= IS the user asking, so that one loads straight away.
      projectSelect.value = wanted;
      await loadBuilds({ initial: true });
      // Deep links accept a build name, or a run id which resolves to the build containing it.
      // Either may live on a page that is not currently loaded; the server resolves it regardless.
      if (params.get('build')) selectBuild(params.get('build'));
      else if (params.get('run')) selectByRunId(params.get('run'));
    } catch (error) {
      projectSelect.innerHTML = '<option value="">Unavailable</option>';
      showError('Could not load projects', error.message);
    }
  }

  /**
   * Fetches ONE page of builds. "initial" marks the first load for a project — the only time the
   * list is blanked and the filter box is disabled, since doing that on a debounced keystroke
   * would yank focus mid-word.
   */
  async function loadBuilds(options) {
    options = options || {};
    var wantPage = options.page || 1;
    var initial = options.initial === true;
    var token = ++buildsToken;

    prevBtn.disabled = true;
    nextBtn.disabled = true;
    if (initial) {
      // The first listing for a project can take a while — it reconciles runs the API omits — so
      // say what is happening rather than leaving an empty panel.
      buildList.innerHTML = '<li class="runs-loading"><span class="spinner spinner-sm"></span>' +
        '<span>Fetching builds…</span></li>';
      buildCount.textContent = projectLabel();
      buildSearch.disabled = true;
    } else {
      buildCount.textContent = options.viaPager ? 'Loading page ' + wantPage + '…' : 'Filtering…';
    }

    var filter = buildSearch.value.trim();
    var url = '/api/builds?project=' + encodeURIComponent(projectId()) +
      '&page=' + wantPage + '&page_size=' + PAGE_SIZE +
      (filter ? '&q=' + encodeURIComponent(filter) : '') +
      (options.force ? '&refresh=1' : '');

    try {
      var data = await getJson(url);
      if (token !== buildsToken) return;   // a newer page or filter already won
      builds = data.builds || [];
      paging = {
        page: data.page || 1,
        pageSize: data.pageSize || PAGE_SIZE,
        totalPages: data.totalPages || 1,
        total: data.total || 0,
        totalBuilds: data.totalBuilds || 0,
        filtered: Boolean(data.filtered)
      };
      buildSearch.disabled = false;
      renderBuilds();
    } catch (error) {
      if (token !== buildsToken) return;
      buildSearch.disabled = false;
      buildCount.textContent = '';
      pager.hidden = true;
      buildList.innerHTML = '<li class="runs-empty">Could not load builds.</li>';
      showError('Could not load builds', error.message);
    }
  }

  function goToPage(page) {
    if (page < 1 || page > paging.totalPages || page === paging.page) return;
    loadBuilds({ page: page, viaPager: true });
    buildList.scrollTop = 0;
  }

  /** A run id selects the whole build it belongs to. */
  function selectByRunId(runId) {
    var owner = builds.filter(function (b) { return b.runIds.indexOf(runId) !== -1; })[0];
    if (owner) return selectBuild(owner.key);
    // Not on the loaded page (or not listed at all) — let the server resolve it directly.
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
  // Filtering happens server-side against the full list, so a keystroke is one debounced
  // request against an in-memory snapshot — not another round trip to BrowserStack.
  buildSearch.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadBuilds({ page: 1 }); }, SEARCH_DEBOUNCE_MS);
  });

  prevBtn.addEventListener('click', function () { goToPage(paging.page - 1); });
  nextBtn.addEventListener('click', function () { goToPage(paging.page + 1); });

  projectSelect.addEventListener('change', function () {
    selectedBuild = null;
    contentBar.hidden = true;
    clearTimeout(searchTimer);
    buildSearch.value = '';   // a filter typed for one project means nothing in the next
    history.replaceState(null, '', projectId() ? '?project=' + encodeURIComponent(projectId()) : location.pathname);

    if (!projectId()) {
      buildsToken++;          // abandon any listing still in flight for the previous project
      showState('<div class="placeholder"><p class="placeholder-title">Pick a project</p>' +
                '<p>Choose a project above to list its builds.</p></div>');
      return showNoProjectChosen();
    }
    showState('<div class="placeholder"><p class="placeholder-title">Pick a build</p>' +
              '<p>Choose a build from the list to see its test case-level report.</p></div>');
    loadBuilds({ initial: true });
  });

  refreshBtn.addEventListener('click', async function () {
    if (!projectId()) return;
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    try {
      await loadBuilds({ page: paging.page, force: true });
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
