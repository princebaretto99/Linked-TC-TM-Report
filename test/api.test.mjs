import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BROWSERSTACK_USERNAME ??= 'test-user';
process.env.BROWSERSTACK_ACCESS_KEY ??= 'test-key';
// Keep the pacing tight so the suite stays fast — the behaviour under test is the retry, not the rate.
process.env.BSTACK_MIN_REQUEST_GAP_MS = '1';

const { TestManagementClient, ApiError } = await import('../src/api.mjs');

/** Replaces global fetch for one test, restoring it afterwards. */
async function withFetch(handler, body) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return handler(calls.length, String(url));
  };
  try {
    return await body(new TestManagementClient(), calls);
  } finally {
    globalThis.fetch = original;
  }
}

const json = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), { status, headers });

test('a 429 is retried and the eventual success is returned', async () => {
  await withFetch(
    (n) => (n < 3 ? json({ error: 'slow down' }, 429, { 'retry-after': '0' }) : json({ ok: true })),
    async (client, calls) => {
      assert.deepEqual(await client.request('/projects/PR-1'), { ok: true });
      assert.equal(calls.length, 3, 'two rejections, then the success');
    });
});

test('a 429 that never clears throws, and says how to slow down', async () => {
  await withFetch(
    () => json({ error: 'slow down' }, 429, { 'retry-after': '0' }),
    async (client, calls) => {
      const error = await client.request('/projects/PR-1').then(() => null, (e) => e);
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 429);
      assert.match(error.message, /BSTACK_MIN_REQUEST_GAP_MS/,
        'the message points at the knob that fixes it');
      assert.equal(calls.length, 5, 'the initial attempt plus MAX_RETRIES (4)');
    });
});

test('a 404 is not retried — it is an answer, not a rate limit', async () => {
  await withFetch(
    () => json({ error: 'not found' }, 404),
    async (client, calls) => {
      assert.equal(await client.findTestRun('PR-1', 'TR-9'), null);
      assert.equal(calls.length, 1, 'probing a non-existent run must cost exactly one request');
    });
});

test('concurrent requests are paced, never fired as a burst', async () => {
  const original = globalThis.fetch;
  let inFlight = 0, peak = 0;
  globalThis.fetch = async () => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return json({ test_run: {} });
  };
  try {
    const client = new TestManagementClient();
    await Promise.all(Array.from({ length: 40 }, (_, i) => client.findTestRun('PR-1', 'TR-' + i)));
    assert.ok(peak <= 4, `at most 4 requests in flight, saw ${peak}`);
  } finally {
    globalThis.fetch = original;
  }
});

test('a 429 parks every request still queued, not just the one that was rejected', async () => {
  const original = globalThis.fetch;
  const startedAt = [];
  let served = 0, rejectedAt = 0;
  globalThis.fetch = async () => {
    startedAt.push(Date.now());
    // Only the very first call is rejected; the rest would succeed immediately if unparked.
    if (++served > 1) return json({ test_run: {} });
    rejectedAt = Date.now();
    return json({ error: 'slow down' }, 429, { 'retry-after': '1' });
  };
  try {
    const client = new TestManagementClient();
    await Promise.all(Array.from({ length: 6 }, (_, i) => client.findTestRun('PR-1', 'TR-' + i)));

    // Requests already in flight when the 429 landed cannot be held back — the ones that matter
    // are those still queued, and every one of them must wait out the Retry-After window.
    const stillQueued = startedAt.filter((at) => at > rejectedAt);
    assert.ok(stillQueued.length >= 2, `expected requests to still be queued, saw ${stillQueued.length}`);
    for (const at of stillQueued) {
      assert.ok(at - rejectedAt >= 900,
        `a queued request started ${at - rejectedAt}ms after the 429, before the window elapsed`);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('a dropped connection is retried, not surfaced as a failure', async () => {
  // The reported bug: one stale keep-alive socket became a hard 502 in the web UI.
  const socketError = () => Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
  });
  await withFetch(
    (n) => { if (n === 1) throw socketError(); return json({ test_runs: [], info: { next: null } }); },
    async (client, calls) => {
      assert.deepEqual(await client.request('/projects/PR-24/test-runs'),
        { test_runs: [], info: { next: null } });
      assert.equal(calls.length, 2, 'the retry is what the caller actually sees');
    });
});

test('a connection that never recovers names the real cause, not just "fetch failed"', async () => {
  await withFetch(
    () => { throw Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) }); },
    async (client, calls) => {
      const error = await client.request('/projects').then(() => null, (e) => e);
      assert.match(error.message, /ENOTFOUND/, 'the buried cause is surfaced');
      assert.match(error.message, /after 5 attempts/);
      assert.equal(calls.length, 5);
    });
});

/** Fresh module instance so the ownership-map threshold can be set per test. */
async function clientWithThreshold(threshold, handler) {
  process.env.BSTACK_OWNERSHIP_MAP_THRESHOLD = String(threshold);
  const mod = await import('../src/api.mjs?threshold=' + threshold);
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return handler(String(url)); };
  return { client: new mod.TestManagementClient(), calls, restore: () => { globalThis.fetch = original; } };
}

/** PR-2 owns a wide, sparse range; PR-1 owns almost everything inside it. */
function accountFixture({ hidden = [] } = {}) {
  const owned = { 'PR-2': [10, 300], 'PR-1': Array.from({ length: 289 }, (_, i) => i + 11) };
  return (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/projects')) {
      return json({ projects: [{ identifier: 'PR-1' }, { identifier: 'PR-2' }], info: { next: null } });
    }
    const list = path.match(/\/projects\/(PR-\d+)\/test-runs$/);
    if (list) {
      return json({
        test_runs: (owned[list[1]] ?? []).map((n) => ({ identifier: 'TR-' + n, name: 'b' + n })),
        info: { next: null },
      });
    }
    const probe = path.match(/\/test-runs\/(TR-\d+)$/);
    if (probe) {
      return hidden.includes(probe[1])
        ? json({ test_run: { identifier: probe[1], name: 'hidden' } })
        : json({ error: 'nf' }, 404);
    }
    return json({});
  };
}

test('ids listed by another project are not probed', async () => {
  const { client, calls, restore } = await clientWithThreshold(50, accountFixture());
  try {
    await client.listTestRunsIncludingUnindexed('PR-2');
    const probes = calls.filter((u) => /\/test-runs\/TR-\d+$/.test(new URL(u).pathname));
    // TR-11..TR-299 belong to PR-1; only TR-301..TR-312 (probeAhead) remain unaccounted for.
    assert.equal(probes.length, 12, `expected 12 probes, made ${probes.length}`);
    assert.ok(!probes.some((u) => u.endsWith('/TR-150')), 'PR-1 runs must never be probed for PR-2');
  } finally { restore(); }
});

test('an unaccounted-for id is still probed, so hidden re-runs survive the optimisation', async () => {
  // TR-250 is listed by nobody — exactly the shape of a hidden re-run.
  const fixture = accountFixture({ hidden: ['TR-250'] });
  const owner = (url) => {
    const list = new URL(url).pathname.match(/\/projects\/(PR-\d+)\/test-runs$/);
    if (list && list[1] === 'PR-1') {
      return json({ test_runs: Array.from({ length: 289 }, (_, i) => i + 11)
        .filter((n) => n !== 250)
        .map((n) => ({ identifier: 'TR-' + n, name: 'b' + n })), info: { next: null } });
    }
    return fixture(url);
  };
  const { client, restore } = await clientWithThreshold(50, owner);
  try {
    const { runs, unindexed } = await client.listTestRunsIncludingUnindexed('PR-2');
    assert.deepEqual(unindexed, ['TR-250'], 'the hidden run is still discovered');
    assert.ok(runs.some((r) => r.identifier === 'TR-250'));
  } finally { restore(); }
});

test('below the threshold the ownership map is never built', async () => {
  const { client, calls, restore } = await clientWithThreshold(100000, accountFixture());
  try {
    await client.listTestRunsIncludingUnindexed('PR-2');
    assert.ok(!calls.some((u) => u.endsWith('/projects?p=1&page_size=300')),
      'a small sweep must not pay for enumerating the account');
  } finally { restore(); }
});
