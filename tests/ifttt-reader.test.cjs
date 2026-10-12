/* eslint-disable @typescript-eslint/no-require-imports -- Test loader compiles TypeScript modules in isolation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(file, mocks) {
  const absolute = path.resolve(file);
  const mod = new Module(absolute, module);
  mod.require = name => name in mocks ? mocks[name] : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, absolute);
  return mod.exports;
}
test('IFTTT reader renders supplied text/category and offers Original without X refresh', () => {
  const { renderToStaticMarkup } = require('react-dom/server');
  const React = require('react');
  const { ReaderContent } = load('src/components/ReaderContent.tsx', {
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  });
  const props = { postId: 'p', source: 'ifttt', category: 'technology', authorName: 'alice', authorHandle: 'alice', tags: ['ai'], xPostUrl: 'https://x.com/alice/status/123', postedAt: '2026-10-12T00:00:00Z', savedAt: '2026-10-12T00:00:00Z', parsedContent: { blocks: [{ type: 'text', content: 'Hello <script>unsafe</script>' }] } };
  const html = renderToStaticMarkup(React.createElement(ReaderContent, props));
  assert.ok(html.includes('technology'));
  assert.ok(html.includes('Original'));
  assert.ok(html.includes('Hello &lt;script&gt;unsafe&lt;/script&gt;'));
  assert.ok(!html.includes('Re-fetch content from X'));
  const legacy = renderToStaticMarkup(React.createElement(ReaderContent, { ...props, source: 'manual' }));
  assert.ok(legacy.includes('Re-fetch content from X'));
});
test('PUT rejects IFTTT refresh before reading X connection or calling X', async () => {
  let tableReads = 0;
  const { PUT } = load('src/app/api/posts/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
      from(table) {
        tableReads++;
        assert.equal(table, 'saved_posts');
        return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { source: 'ifttt' } }) };
      },
    }) },
    '@supabase/supabase-js': { createClient: () => { throw Error('Unexpected admin call'); } },
    '@/lib/parser': {}, '@/lib/summarize': {}, '@/lib/vector-search': {},
    '@/lib/x-api/fetch-with-refresh': { fetchTweetWithRefresh: () => { throw Error('Unexpected X call'); } },
  });
  const result = await PUT(new Request('https://test/api/posts', { method: 'PUT', body: JSON.stringify({ id: 'p' }) }));
  assert.equal(result.status, 400);
  assert.equal(tableReads, 1);
});
