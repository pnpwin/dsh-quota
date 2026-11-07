import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutDiagnostics, LAYOUT_SAMPLE_SCHEMA, LAYOUT_VERSION, validateLayoutReport } from '../layout-diagnostics.js';
import { apply, SNAPSHOT_SCHEMA } from '../index.js';

const report = (patch = {}) => ({
  version: LAYOUT_VERSION, viewportWidth: 1440, barWidth: 375.25, moreWidth: 18.5,
  chipWidths: [160.125, 72, 88, 56], visibleCount: 3, hiddenCount: 1,
  flexGrow: 1, flexShrink: 0.5, flexBasisPx: 400.125,
  supportsHas: true, directDockChild: true, ...patch,
});
const invalidSettings = error => error.code === 'invalid-settings';

function fixture() {
  const routes = new Map(), effects = [], calls = [];
  let tool;
  const ctx = {
    effect: factory => { const cleanup = factory(); effects.push(cleanup); return cleanup; },
    connection: { fetch: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path); } } },
    tools: { register: value => { tool = value; return () => {}; } },
    llm: { listConfigurableProviders: () => { calls.push('providers'); return []; } },
    settings: { describe: () => { calls.push('settings'); return []; } },
    credentials: {
      describe: () => assert.fail('Report endpoint must not inspect credentials'),
      resolve: () => assert.fail('Report endpoint must not resolve credentials'),
      readRecord: () => assert.fail('Report endpoint must not read credentials'),
    },
    fiber: { entry: {} },
    get: () => { calls.push('config-editor'); return { edit: () => assert.fail('Report endpoint must not persist settings') }; },
  };
  apply(ctx);
  const post = (payload, headers = { 'content-type': 'application/json' }) => routes.get('/api/llm-quota/layout').fetch(new Request('http://localhost/api/llm-quota/layout', {
    method: 'POST', headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  }));
  return {
    routes, tool, calls, post,
    dispose: async () => { for (const cleanup of effects.reverse()) await cleanup?.(); },
  };
}

test('layout reports validate exact whitelisted primitive fields and copy input arrays', () => {
  const payload = report();
  const clean = validateLayoutReport(payload);
  assert.deepEqual(clean, payload);
  assert.notEqual(clean.chipWidths, payload.chipWidths);
  payload.chipWidths[0] = 999;
  assert.equal(clean.chipWidths[0], 160.125);
  assert.deepEqual(validateLayoutReport(report({ flexBasisPx: null, supportsHas: false, directDockChild: false })), report({ flexBasisPx: null, supportsHas: false, directDockChild: false }));
  assert.deepEqual(validateLayoutReport(report({ chipWidths: [], visibleCount: 0, hiddenCount: 0 })), report({ chipWidths: [], visibleCount: 0, hiddenCount: 0 }));
  const boundary = report({ viewportWidth: 100000, barWidth: 0, moreWidth: 100000, chipWidths: Array(100).fill(100000), visibleCount: 0, hiddenCount: 100, flexGrow: 10000, flexShrink: 0, flexBasisPx: 100000 });
  assert.deepEqual(validateLayoutReport(boundary), boundary);
});

test('layout report rejects unknown or missing fields, invalid shapes, nonfinite numbers and bounds', () => {
  for (const bad of [null, [], true, 1, 'report', new Date(), Object.create(report())]) assert.throws(() => validateLayoutReport(bad), invalidSettings);
  for (const key of Object.keys(report())) {
    const missing = report(); delete missing[key];
    assert.throws(() => validateLayoutReport(missing), invalidSettings);
  }
  for (const key of ['viewportWidth', 'barWidth', 'moreWidth', 'flexBasisPx']) {
    for (const value of [-1, 100001, NaN, Infinity, -Infinity, '4', undefined, {}, true]) assert.throws(() => validateLayoutReport(report({ [key]: value })), invalidSettings);
  }
  for (const key of ['flexGrow', 'flexShrink']) {
    for (const value of [-1, 10001, NaN, Infinity, '1', null]) assert.throws(() => validateLayoutReport(report({ [key]: value })), invalidSettings);
  }
  for (const key of ['visibleCount', 'hiddenCount']) {
    for (const value of [-1, 101, 0.5, NaN, Infinity, '1', null]) assert.throws(() => validateLayoutReport(report({ [key]: value })), invalidSettings);
  }
  for (const chipWidths of [null, {}, '1', [-1], [100001], [NaN], [Infinity], ['1'], Array(1), Array(101).fill(1)]) assert.throws(() => validateLayoutReport(report({ chipWidths, visibleCount: 0, hiddenCount: chipWidths?.length ?? 0 })), invalidSettings);
  for (const key of ['supportsHas', 'directDockChild']) {
    for (const value of [null, 'true', 1, undefined]) assert.throws(() => validateLayoutReport(report({ [key]: value })), invalidSettings);
  }
  for (const patch of [{ version: '1.1.0-local.3' }, { version: 'private-token' }, { visibleCount: 4 }, { hiddenCount: 0 }, { receivedAt: 'spoof' }, { token: 'private-token' }, { providerId: 'private-provider' }, { path: '/private/file' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => validateLayoutReport(report(patch)), invalidSettings);
});

test('anonymous layout store retains only latest eight, timestamps server-side and isolates all arrays', () => {
  let time = 1800000000000;
  const store = createLayoutDiagnostics({ now: () => time++ });
  const payload = report();
  assert.deepEqual(store.accept(payload), { received: true });
  payload.chipWidths[0] = 999;
  assert.equal(store.read()[0].chipWidths[0], 160.125);
  assert.equal(store.read()[0].receivedAt, new Date(1800000000000).toISOString());
  for (let index = 1; index < 10; index++) store.accept(report({ barWidth: index }));
  const samples = store.read();
  assert.equal(samples.length, 8);
  assert.deepEqual(samples.map(sample => sample.barWidth), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(Object.keys(samples[0]).sort(), [...Object.keys(report()), 'receivedAt'].sort());
  samples[0].chipWidths[0] = 800;
  samples[0].barWidth = 900;
  samples.length = 0;
  assert.equal(store.read()[0].barWidth, 2);
  assert.equal(store.read()[0].chipWidths[0], 160.125);
  assert.throws(() => store.accept(report({ secret: 'not-retained' })), invalidSettings);
  assert.equal(store.read().length, 8);
  assert.ok(!JSON.stringify(store.read()).includes('not-retained'));
  store.dispose();
  assert.deepEqual(store.read(), []);
  assert.throws(() => store.accept(report()), error => error.code === 'cancelled');
  assert.deepEqual(createLayoutDiagnostics().read(), []);
});

test('layout POST is bounded, anonymous, unaffiliated with provider operations, and shares read/refresh output', async t => {
  const f = fixture(); t.after(f.dispose);
  const route = f.routes.get('/api/llm-quota/layout');
  assert.deepEqual(route.methods, ['POST']);
  assert.equal(route.requestBody, 'buffered');
  for (let i = 0; i < 10; i++) {
    const response = await f.post(report({ barWidth: i }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { received: true });
  }
  assert.deepEqual(f.calls, [], 'No discovery, credential, config-editor or provider operations on the report path');
  const httpSnapshot = await f.routes.get('/api/llm-quota/snapshot').fetch(new Request('http://localhost/api/llm-quota/snapshot'));
  const first = await httpSnapshot.json();
  assert.equal(first.layout.length, 8);
  assert.deepEqual(first.layout.map(sample => sample.barWidth), [2, 3, 4, 5, 6, 7, 8, 9]);
  const read = await f.tool.execute({ action: 'read' });
  assert.deepEqual(read.layout, first.layout);
  read.layout[0].chipWidths[0] = 10000;
  assert.equal((await f.tool.execute({ action: 'read' })).layout[0].chipWidths[0], 160.125);
  const refresh = await f.tool.execute({ action: 'refresh' });
  assert.deepEqual(refresh.layout, first.layout);
  const httpRefresh = await f.routes.get('/api/llm-quota/refresh').fetch(new Request('http://localhost/api/llm-quota/refresh', { method: 'POST' }));
  assert.deepEqual((await httpRefresh.json()).layout, first.layout);
  assert.deepEqual(f.tool.parameters.properties.action.enum, ['read', 'refresh', 'settings']);
  assert.deepEqual(Object.keys(f.tool.parameters.properties), ['action', 'patch']);
});

test('HTTP layout rejection is sanitized, enforces existing 16 KiB body cap and keeps prior reports', async t => {
  const f = fixture(); t.after(f.dispose);
  await f.post(report());
  for (const [payload, headers] of [
    [report({ secret: 'private-token' }), undefined],
    [report({ chipWidths: [1], visibleCount: 3, hiddenCount: 1 }), undefined],
    ['{private-token', undefined],
    [JSON.stringify({ ...report(), secret: 'private-token'.repeat(2000) }), undefined],
    [report(), { 'content-type': 'text/plain' }],
    [report(), { 'content-type': 'application/json', 'content-length': '16385' }],
  ]) {
    const response = await f.post(payload, headers);
    assert.equal(response.status, 400);
    const error = await response.text();
    assert.ok(error.includes('invalid-settings'));
    assert.ok(!error.includes('private-token'));
  }
  assert.deepEqual(f.calls, []);
  assert.equal((await f.tool.execute({ action: 'read' })).layout.length, 1);
});

test('plugin disposal unregisters layout route and releases reports instead of persisting history', async () => {
  const f = fixture();
  await f.post(report());
  const retainedRoute = f.routes.get('/api/llm-quota/layout');
  await f.dispose();
  assert.equal(f.routes.size, 0);
  const response = await retainedRoute.fetch(new Request('http://localhost/api/llm-quota/layout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report()) }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'cancelled');
  const next = fixture();
  try { assert.deepEqual((await next.tool.execute({ action: 'read' })).layout, []); }
  finally { await next.dispose(); }
});

test('optional layout output uses only supported DSH schema subset recursively', () => {
  assert.equal(SNAPSHOT_SCHEMA.properties.layout.items, LAYOUT_SAMPLE_SCHEMA);
  assert.ok(!SNAPSHOT_SCHEMA.required.includes('layout'));
  assert.deepEqual(LAYOUT_SAMPLE_SCHEMA.properties.version, { type: 'string', const: '1.1.0' });
  assert.equal(LAYOUT_SAMPLE_SCHEMA.properties.directDockChild.type, 'boolean');
  const allowed = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'oneOf', 'enum', 'const', 'description', 'default']);
  function check(schema) {
    for (const key of Object.keys(schema)) assert.ok(allowed.has(key), `Unsupported schema keyword ${key}`);
    if (Object.hasOwn(schema, 'additionalProperties')) assert.equal(typeof schema.additionalProperties, 'boolean');
    for (const nested of Object.values(schema.properties ?? {})) check(nested);
    for (const nested of schema.oneOf ?? []) check(nested);
    if (schema.items) check(schema.items);
  }
  check(SNAPSHOT_SCHEMA);
});
