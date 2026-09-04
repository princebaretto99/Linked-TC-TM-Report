import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../src/aggregate.mjs';
import { renderHtml } from '../src/render.mjs';
import { renderApp } from '../src/ui.mjs';

const model = aggregate({
  roster: [{ identifier: 'TC-1', name: 'one', latest_status: 'Passed', configuration_id: 1 }],
  results: [{ id: 1, test_case_id: 'TC-1', result_status: { field_value: 'Passed' },
              created_at: '2026-09-04T10:00:00Z', configuration_id: 1, execution_id: 'abc123def456' }],
});

test('the report page is self-contained and escapes API strings', () => {
  const html = renderHtml({
    project: { identifier: 'PR-1', name: '<script>alert(1)</script>' },
    run: { identifier: 'TR-1', name: 'build #1' }, model,
  });
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/<script[\s>]/g) || []).length, 1, 'exactly one script tag: ours');
  assert.doesNotMatch(html, /<(img|iframe|object)[\s>]/, 'no injected tags');
  assert.match(html, /&lt;script&gt;/, 'the project name is escaped, not executed');
  // No external requests: nothing may reference an off-host URL except TM deep links.
  const externals = (html.match(/(src|href)="https?:\/\/[^"]+"/g) || [])
    .filter((ref) => !ref.includes('test-management.browserstack.com'));
  assert.deepEqual(externals, [], 'no external assets');
});

test('the app shell emits usable JavaScript', () => {
  const html = renderApp();
  assert.match(html, /id="fetched"/, 'the freshness stamp is present');
  assert.doesNotMatch(html, /by-id/, 'the open-by-run-ID box was removed');
});

test('the BrowserStack mark is inlined, not fetched', () => {
  const html = renderApp();
  assert.match(html, /aria-label="BrowserStack"/, 'the mark is present');
  assert.match(html, /class="brand-name">BrowserStack</, 'the wordmark is themeable text');
  // The only permitted absolute URL is the SVG namespace, which is an identifier, not a request.
  const urls = (html.match(/https?:\/\/[^"' ]+/g) || [])
    .filter((url) => url !== 'http://www.w3.org/2000/svg');
  assert.deepEqual(urls, [], 'the app shell makes no external requests');
});

test('every backslash escape in the inlined script survives rendering', () => {
  const html = renderApp() + renderHtml({ project: {}, run: {}, model });
  // Any surviving lone backslash would mean an escape leaked through unintentionally.
  for (const script of html.match(/<script>([\s\S]*?)<\/script>/g) || []) {
    const stray = script.match(/\\[a-zA-Z]/g) || [];
    assert.deepEqual(stray, [], `unexpected escape sequences in inlined script: ${stray}`);
  }
});
