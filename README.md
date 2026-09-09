# Test Case–Level Status Report

Reports BrowserStack Test Management automation runs at the **test case level** instead of the
`it` block level.

The build view in Test Management shows one row per automation test, with linked test cases
tucked into a hover popover. This flips that around: one row per test case from your repository,
with the status that this run gave it.

That inversion is not a relabelling. The mapping is many-to-many — one `it` block can carry
several test case IDs, one test case can be fed by several `it` blocks, and every combination
runs on every configuration and may be retried. Build #38 in the screenshot reports "3 unique
tests"; at test case level that is **4 test cases**.

## Setup

Node 18+ (22 recommended). No dependencies, nothing to install.

```bash
cp .env.example .env
```

Fill in `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` from
[your profile page](https://www.browserstack.com/accounts/profile/details).
`.env` is gitignored. Environment variables take precedence if both are set.

## Two ways to use it

### Web UI

```bash
npm run serve          # → http://127.0.0.1:4173
```

Pick a project from the dropdown, pick a **build** from the sidebar, and the report renders in
place. Builds that were re-run are badged with their run count and reported as one.
From there you can **Download HTML**, **Save to reports/** (same output the CLI writes), or open the
raw **JSON** model. The URL carries `?project=…&run=…`, so a view can be bookmarked or shared with
someone else running the server.

The server binds to `127.0.0.1` only — it holds your BrowserStack credentials in memory and must
not be reachable from the network. Use `--port` if 4173 is taken.

**Test runs, linked test cases, and results are always fetched live** — never cached. Re-run a
build, reload, and you see the new numbers. The content bar stamps when the report was fetched so
freshness is never in doubt. Only the project list and the configuration list (hundreds of rows,
effectively static) are cached, for 10 minutes; **Refresh** clears them and re-lists runs.

**No project is selected on arrival.** Listing a project's builds is the expensive call — it
reconciles the runs the API omits — so it waits to be asked rather than firing for whichever
project happened to sort first. A `?project=PR-x` deep link counts as asking and loads straight
away.

The build list is paginated at **10 per page**, filtered and sliced server-side from a listing
snapshot held for 60 seconds. Paging and typing in the filter cost nothing upstream — measured on a
1,679-build project, every page including the 168th returns in under a millisecond. Note that the
page size is display-only: the full listing is fetched either way, so lowering it makes the list
shorter, **not** the fetch smaller or the API load lighter. Without the snapshot, each page click
would re-run the identifier sweep described under **The API's run list is incomplete** in
[Troubleshooting](#troubleshooting) and quickly earn an HTTP 429. The snapshot only decides *which
builds appear in the list*; opening one still fetches its results live.

The page does not re-implement the report — it fetches the exact HTML `renderHtml` produces and
frames it, so what you see and what you download are the same bytes.

### CLI

List every build in a project:

```bash
node bin/report.mjs --project PR-155 --list
```

Generate the report — pick interactively, name a build, take the newest, or give any run id:

```bash
node bin/report.mjs --project PR-155
node bin/report.mjs --project PR-155 --build "browserstack build #40" --open
node bin/report.mjs --project PR-155 --build latest
node bin/report.mjs --project PR-155 --run TR-1195        # reports its whole build
```

The report is written to `reports/<PR>-<TR>-<timestamp>.html` — one self-contained file that
opens straight from disk with no network access.

| Option | |
|---|---|
| `--project`, `-p` | Project identifier. Prompts from your project list if omitted. |
| `--build`, `-b` | Build name, or `latest`. Prompts if omitted. |
| `--run`, `-r` | Any run id; reports the whole build that run belongs to. |
| `--list`, `-l` | Print the build table and exit. |
| `--out`, `-o` | Output path. |
| `--json` | Also write the aggregated model as JSON, for feeding elsewhere. |
| `--open` | Open the finished report in your browser. |
| `--raw <resource>` | Dump raw API JSON — `projects`, `test-runs`, `test-cases`, `results`, `configurations`. |

## Builds, not test runs

A re-run does not append to the existing test run — BrowserStack creates a **new test run carrying
the same build name**. PR-155 ended up with two runs both called *browserstack build #40*:
TR-1194 (3 Failed / 2 Skipped / 2 Passed) and TR-1195, the re-run, all green.

Reporting those separately makes a build look broken when it is not, so **the build name is the
unit of reporting**. Every test run sharing a name is merged, and their results unioned, before
statuses are resolved. Build #40 reads as 6/6 passed, with the earlier failures still visible one
level down.

Runs are merged oldest → newest, so later results naturally win. Each result keeps its **Test run**
column, and every test case row notes which run produced its winning status. A build that was
re-run is badged with its run count in the sidebar and carries a banner naming its runs.

Runs with no name never merge — they fall back to their own identifier as the key.

## How a test case's status is decided

**The chronologically latest result wins.** For each test case, every result posted against it in
the run is collected — across all linked `it` blocks, all configurations, and all retries — then
sorted by time. The most recent one sets the status.

So for `it-1 → (TC-1, TC-2)` passing and `it-2 → (TC-2, TC-3)` failing:

| | |
|---|---|
| TC-1 | Passed — only `it-1` touched it |
| TC-3 | Failed — only `it-2` touched it |
| TC-2 | whichever of `it-1` / `it-2` finished **last** |

A retry that passes therefore reports Passed, matching the BrowserStack build UI.

Nothing is thrown away: expanding a row lists every contributing result with its timestamp,
configuration, and originating `it` block, so any headline status can be traced back.

### Recovering which `it` block produced a result

SDK-created runs return `description: null` on every result, so the automation test's *name* is not
in the API payload. What is there is **`execution_id`** — results written by the same `it` block
execution share one. That is enough to rebuild the grouping.

Each result is therefore labelled with its execution's ordinal (`#1`, `#2`, … in run order), its
short id, and — the useful part — **which other test cases the same automation test set**. For
build #38 that reconstructs the tagging exactly:

| Execution | Test cases it set |
|---|---|
| `#1` | TC-1756 |
| `#2` | TC-1757, TC-1778 |
| `#3` | TC-1758, TC-1778 |

Three `it` blocks, four test cases. A test case fed by more than one is badged *via N automation
tests* in the main table. Each result's timestamp also links to that individual result in Test
Management.

If a run's results carry no `execution_id`, the column degrades to `—` and everything else still
works.

### The ⚠ flag

Each row's derived status is cross-checked against the `latest_status` the API reports for that
test case. When they disagree the row is flagged and a banner appears at the top. That is a
canary for a wrong assumption about result ordering — worth investigating rather than trusting
blindly.

## Report contents

- Summary tiles: automation tests, linked test cases, passed / failed / skipped / untested, pass rate
  (the first two tiles are the inversion in miniature — e.g. *3 automation tests → 4 test cases*)
  (pass rate is over *executed* cases, so untested ones do not drag it down)
- One row per test case: ID (linked to Test Management), title, latest status, the configuration
  that produced it, and when
- Expandable detail: every result, newest first, with the latest one marked
- Client-side status filters and search; failures sort to the top
- Test cases linked to the run but never executed appear as **Untested** rather than vanishing
- Custom Test Management statuses pass through instead of being coerced to a known one

## Layout

| | |
|---|---|
| `server.mjs` | Local HTTP server + JSON API for the web UI |
| `src/ui.mjs` | The app shell served at `/` |
| `bin/report.mjs` | CLI: flag parsing, pickers, orchestration |
| `src/api.mjs` | Test Management API v2 client, auth, pagination |
| `src/builds.mjs` | Groups test runs into builds by name |
| `src/aggregate.mjs` | Results + roster → test-case-level model. Pure, no I/O. |
| `src/render.mjs` | Model → self-contained HTML |
| `test/aggregate.test.mjs` | The status rule, pinned |

```bash
npm test
```

The tests cover the worked example above in both orderings — the reversed one asserts TC-2 is
*Passed*, which is what stops the rule silently drifting to "worst status wins".

## Troubleshooting

**No linked test cases found.** The run has no test case tags. Confirm the automation tests carry
Test Case IDs, then inspect the payloads:

```bash
node bin/report.mjs -p PR-155 -r TR-78282 --raw results
```

**HTTP 400 "Invalid page_size".** The API accepts only `30` or `300` — not an arbitrary value in
that range, despite the docs describing it as a range. The client asks for `300` deliberately: it
is the setting that makes the fewest requests, and requests are what get rate limited. The 30-per-page
build list in the web UI is a separate, display-only page size and does not change what is fetched.

**HTTP 429 "rate limited".** Handled automatically — every call is paced by a shared throttle
(max 4 in flight, ≥60 ms apart) and retried up to 4 times with exponential backoff, honouring
`Retry-After`. Because the limit is per account, a 429 parks *every* queued request for the retry
window rather than letting the rest fail behind it.

**HTTP 502 "Network error calling …".** The server could not reach BrowserStack at all — as opposed
to reaching it and being refused, which surfaces as 401/404/429. Dropped connections are retried
like a 429 (fast backoff: a keep-alive socket the far end closed while idle fails instantly and
succeeds on the next attempt), so a 502 means it failed every attempt. The message names the real
cause — `ECONNRESET`, `ENOTFOUND`, `UND_ERR_SOCKET` — rather than undici's bare "fetch failed";
check VPN or proxy if you use one.

If you still see 429s — a busy account, or several tools sharing the credentials — slow the client
down without touching the code:

| Variable | Default | Effect |
|---|---|---|
| `BSTACK_MIN_REQUEST_GAP_MS` | `60` | Minimum gap between request starts. Raise it to lower the rate (`120` ≈ 8 req/s). |
| `BSTACK_MAX_CONCURRENCY` | `4` | Requests in flight at once. |
| `BSTACK_MAX_RETRIES` | `4` | Retries before a 429 or connection failure is surfaced as an error. |
| `BSTACK_OWNERSHIP_MAP_THRESHOLD` | `200` | Sweep size above which ids are ruled out by owner first (below). |

```bash
BSTACK_MIN_REQUEST_GAP_MS=150 node server.mjs
```

**HTTP 401.** Credentials rejected — check `.env`, and that the account has Test Management access.

**Port already in use.** `node server.mjs --port 4174`.

**The API's run list is incomplete — the tool works around it.**

`GET /projects/{id}/test-runs` hides re-runs. Measured against PR-155: it returned **42 runs**
(and `count: 42`) while **62 actually exist**. For every build that ran more than once it returns
only the *first* run and omits the rest:

| Build | Listed | Hidden |
|---|---|---|
| #36 | TR-1182 | TR-1184, TR-1185, TR-1186, TR-1188 |
| #40 | TR-1194 | TR-1195 — the re-run that fixed it |
| #41 | TR-1196 | TR-1197, TR-1198 |

No filter surfaces them — `created_after`, `run_state` and `include_closed` were all tried — while
`GET /test-runs/{id}` returns each one fine.

Those hidden runs are precisely the ones that decide a build's status, so the listing is treated as
incomplete: the tool probes the identifier space directly and merges in whatever really exists. The
first request for a project sweeps its whole id range (a burst of cheap 404s, a few seconds); the
results are remembered for the life of the process, and later requests only re-check a recent
window. The CLI reports how many runs it recovered.

If the numbers still look wrong, compare against the raw payload:
`node bin/report.mjs -p PR-155 -r TR-1195 --raw results`.

## API reference

Base `https://test-management.browserstack.com/api/v2`, HTTP Basic auth.
[Docs](https://www.browserstack.com/docs/test-management/api-reference/introduction).

| Purpose | Endpoint |
|---|---|
| Projects | `GET /projects` |
| Test runs | `GET /projects/{pid}/test-runs?include_closed=true` |
| Linked test cases | `GET /projects/{pid}/test-runs/{rid}/test-cases` |
| Results | `GET /projects/{pid}/test-runs/{rid}/results` |
| Configurations | `GET /projects/{pid}/configurations` |
