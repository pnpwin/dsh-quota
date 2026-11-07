import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotaBackend, DEFAULT_SETTINGS, SETTINGS_SCHEMA, validatePatch } from '../backend.js';
import { apply, SNAPSHOT_SCHEMA } from '../index.js';

function fixture(config = {}, options = {}) {
  let persisted = { preserved: 'unrelated', ...structuredClone(config) };
  const edits = [];
  const effects = [];
  const routes = new Map();
  let tool;
  const ctx = {
    llm: { listConfigurableProviders: () => [] },
    settings: { describe: () => [] },
    credentials: {},
    fiber: { entry: { id: 'balance-settings-test' } },
    get: key => key === 'configEditor' ? {
      edit: async (entry, change) => {
        edits.push(entry);
        if (options.failSave) throw new Error('private persistence failure');
        options.beforeSave?.();
        persisted = structuredClone(change(persisted));
      },
    } : undefined,
    effect: factory => { const dispose = factory(); effects.push(dispose); return dispose; },
    connection: { fetch: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path); } } },
    tools: { register: definition => { tool = definition; return () => {}; } },
  };
  const backend = createQuotaBackend(ctx, config, {
    now: () => 1800000000000,
    request: () => assert.fail('Settings must not perform network requests, including FX lookups'),
  });
  return {
    backend, ctx, edits, routes,
    get persisted() { return persisted; },
    get tool() { return tool; },
    dispose: async () => {
      backend.dispose();
      for (const dispose of effects.reverse()) await dispose?.();
    },
  };
}

const invalidSettings = error => error.code === 'invalid-settings';

test('balance defaults are frozen manual USD/CNY thresholds and older config gains them', async t => {
  assert.deepEqual(DEFAULT_SETTINGS.lowBalanceThresholds, { USD: 1, CNY: 7 });
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS.lowBalanceThresholds));
  for (const config of [{}, { showBar: false, mode: 'worst', refreshSeconds: 60 }]) {
    const f = fixture(config);
    t.after(f.dispose);
    const snapshot = await f.backend.snapshot();
    assert.deepEqual(snapshot.settings, { ...DEFAULT_SETTINGS, ...config });
    snapshot.settings.lowBalanceThresholds.USD = 999;
    assert.deepEqual((await f.backend.snapshot()).settings.lowBalanceThresholds, { USD: 1, CNY: 7 });
    assert.equal(f.edits.length, 0, 'Migration supplies defaults without rewriting saved config');
  }
});

test('valid balance maps are copied, accept zero and bounds, and allow all seven settings', () => {
  for (const thresholds of [{}, { USD: 0 }, { USD: 1, CNY: 7, EUR: 0.95 }, { JPY: 1e12 }, Object.assign(Object.create(null), { GBP: 0.8 })]) {
    const patch = { lowBalanceThresholds: thresholds };
    const clean = validatePatch(patch);
    assert.deepEqual(clean.lowBalanceThresholds, { ...thresholds });
    assert.notEqual(clean.lowBalanceThresholds, thresholds);
    clean.lowBalanceThresholds.USD = 123;
    assert.notEqual(thresholds.USD, 123);
  }
  assert.deepEqual(validatePatch({ ...DEFAULT_SETTINGS }), DEFAULT_SETTINGS);
  const maxMap = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`, i]));
  assert.deepEqual(validatePatch({ lowBalanceThresholds: maxMap }).lowBalanceThresholds, maxMap);
});

test('invalid balance map shapes, currency codes, numeric values and oversized maps are rejected', () => {
  const tooMany = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`, i]));
  const invalid = [
    null, [], 1, 'USD:1', true, new Date(), new Map([['USD', 1]]), Object.create({ USD: 1 }),
    { usd: 1 }, { UsD: 1 }, { US: 1 }, { USDD: 1 }, { 'USD\n': 1 }, { ' USD': 1 }, { '123': 1 },
    { '': 1 }, { '€UR': 1 }, JSON.parse('{"__proto__":1}'),
    ...[-1, -Number.MIN_VALUE, NaN, Infinity, -Infinity, 1e12 + 1, '1', null, true, {}, []].map(USD => ({ USD })),
    tooMany,
  ];
  for (const lowBalanceThresholds of invalid) assert.throws(() => validatePatch({ lowBalanceThresholds }), invalidSettings);
  assert.throws(() => validatePatch({ ...DEFAULT_SETTINGS, extra: true }), invalidSettings);
});

test('initial config and returned snapshots cannot mutate active balance thresholds', async t => {
  const config = { lowBalanceThresholds: { EUR: 0.9 } };
  const f = fixture(config);
  t.after(f.dispose);
  config.lowBalanceThresholds.EUR = 500;
  config.lowBalanceThresholds.USD = 1;
  const first = await f.backend.snapshot();
  assert.deepEqual(first.settings.lowBalanceThresholds, { EUR: 0.9 });
  first.settings.lowBalanceThresholds.EUR = 200;
  assert.deepEqual((await f.backend.snapshot()).settings.lowBalanceThresholds, { EUR: 0.9 });
  const inherited = fixture(Object.create({ lowBalanceThresholds: { USD: -1 } }));
  t.after(inherited.dispose);
  assert.deepEqual((await inherited.backend.snapshot()).settings.lowBalanceThresholds, { USD: 1, CNY: 7 });
});

test('balance map replacement persists, survives remount and an empty map disables thresholds', async t => {
  const patch = { lowBalanceThresholds: { EUR: 0.95 } };
  const f = fixture({ mode: 'worst', lowBalanceThresholds: { USD: 1, CNY: 7 } }, {
    beforeSave: () => { patch.lowBalanceThresholds.EUR = 500; },
  });
  t.after(f.dispose);
  await f.backend.snapshot();
  const saved = await f.backend.updateSettings(patch);
  assert.deepEqual(saved.settings.lowBalanceThresholds, { EUR: 0.95 });
  assert.deepEqual(f.persisted, { preserved: 'unrelated', mode: 'worst', lowBalanceThresholds: { EUR: 0.95 } });
  assert.equal(f.edits[0], f.ctx.fiber.entry);
  saved.settings.lowBalanceThresholds.EUR = 300;
  assert.deepEqual((await f.backend.snapshot()).settings.lowBalanceThresholds, { EUR: 0.95 });
  const { preserved, ...remountConfig } = f.persisted;
  const remount = fixture(remountConfig);
  t.after(remount.dispose);
  assert.deepEqual((await remount.backend.snapshot()).settings.lowBalanceThresholds, { EUR: 0.95 });
  assert.deepEqual((await f.backend.updateSettings({ lowBalanceThresholds: {} })).settings.lowBalanceThresholds, {});
  assert.deepEqual(f.persisted.lowBalanceThresholds, {});
  assert.deepEqual((await f.backend.snapshot()).settings.lowBalanceThresholds, {});
});

test('invalid updates and failed saves preserve active and persisted thresholds', async t => {
  const f = fixture({ lowBalanceThresholds: { GBP: 0.8 } }, { failSave: true });
  t.after(f.dispose);
  await assert.rejects(f.backend.updateSettings({ lowBalanceThresholds: { usd: 1 } }), invalidSettings);
  assert.equal(f.edits.length, 0);
  await assert.rejects(f.backend.updateSettings({ lowBalanceThresholds: {} }), error => error.code === 'settings-save-failed');
  assert.deepEqual((await f.backend.snapshot()).settings.lowBalanceThresholds, { GBP: 0.8 });
  assert.deepEqual(f.persisted.lowBalanceThresholds, { GBP: 0.8 });
});

test('shared tool and snapshot schemas expose bounded balance thresholds and defaults', async t => {
  const schema = SETTINGS_SCHEMA.properties.lowBalanceThresholds;
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, true);
  assert.match(schema.description, /at most 32/);
  // DSH rejects ordinary JSON Schema map validators even if runtime fixtures accept them.
  const allowed=new Set(['type','oneOf','properties','required','additionalProperties','items','enum','const','description','default','title','examples']);
  const visit=node=>{
    for(const [key,value] of Object.entries(node)){
      assert.ok(allowed.has(key), `Unsupported DSH schema keyword: ${key}`);
      if(key==='additionalProperties')assert.equal(typeof value,'boolean');
      if(key==='properties')Object.values(value).forEach(visit);
      if(key==='items')visit(value);
      if(key==='oneOf')value.forEach(visit);
    }
  };
  visit(SNAPSHOT_SCHEMA);visit(SETTINGS_SCHEMA);
  assert.deepEqual(schema.default, { USD: 1, CNY: 7 });
  assert.equal(SNAPSHOT_SCHEMA.properties.settings.properties.lowBalanceThresholds, schema);
  assert.ok(SNAPSHOT_SCHEMA.properties.settings.required.includes('lowBalanceThresholds'));
  const f = fixture();
  t.after(f.dispose);
  apply(f.ctx);
  assert.equal(f.tool.parameters.properties.patch.properties.lowBalanceThresholds, schema);
  assert.equal(f.tool.output.schema.oneOf[0].properties.settings.properties.lowBalanceThresholds, schema);
  assert.deepEqual((await f.tool.execute({ action: 'read' })).settings.lowBalanceThresholds, { USD: 1, CNY: 7 });
  const saved = await f.tool.execute({ action: 'settings', patch: { lowBalanceThresholds: { EUR: 0.95 } } });
  assert.deepEqual(saved.settings.lowBalanceThresholds, { EUR: 0.95 });
  const response = await f.routes.get('/api/llm-quota/snapshot').fetch(new Request('http://localhost/api/llm-quota/snapshot'));
  assert.deepEqual((await response.json()).settings.lowBalanceThresholds, { EUR: 0.95 });
  const cleared = await f.routes.get('/api/llm-quota/settings').fetch(new Request('http://localhost/api/llm-quota/settings', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lowBalanceThresholds: {} }),
  }));
  assert.equal(cleared.status, 200);
  assert.deepEqual((await cleared.json()).settings.lowBalanceThresholds, {});
  assert.deepEqual((await f.tool.execute({ action: 'read' })).settings.lowBalanceThresholds, {});
  const invalid = await f.tool.execute({ action: 'settings', patch: { lowBalanceThresholds: { EUR: -1 } } });
  assert.equal(invalid.error.code, 'invalid-settings');
  const badResponse = await f.routes.get('/api/llm-quota/settings').fetch(new Request('http://localhost/api/llm-quota/settings', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lowBalanceThresholds: { usd: 1 } }),
  }));
  assert.equal(badResponse.status, 400);
});
