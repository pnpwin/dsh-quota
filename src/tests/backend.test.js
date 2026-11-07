import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotaBackend, configuredRoutes, DEFAULT_SETTINGS, storedAuth, validatePatch, sortProvidersByName } from '../backend.js';
import { adapterFor, QuotaError } from '../providers.js';
import { apply, inject, SNAPSHOT_SCHEMA } from '../index.js';

function fixture(options = {}) {
  let time = 1800000000000;
  const calls = [];
  const listeners = new Map();
  const profiles = options.profiles ?? { deepseek: { apiKeyEnv: 'SAVED_DEEPSEEK' } };
  const directory = options.directory ?? Object.keys(profiles).map(provider => ({ provider, displayName: provider, settingsNs: 'models', settingsPath: ['providers', provider], defaultBaseURL: 'https://api.deepseek.com', nativeAuth: { env: ['NATIVE_KEY'], oauth: false } }));
  const descriptors = [{ ns: 'models', value: { providers: profiles } }];
  const ctx = {
    llm: { listConfigurableProviders: () => directory },
    settings: { describe: arg => { calls.push(['describe-settings', arg]); return descriptors; } },
    credentials: {
      describe: async ref => { calls.push(['describe', ref]); return { configured: true, source: options.source ?? 'file', writable: true }; },
      resolve: async ref => { calls.push(['resolve', ref]); return { value: 'synthetic-secret-123', source: options.resolvedSource ?? options.source ?? 'file' }; },
      readRecord: async key => { calls.push(['record', key]); return options.record; },
    },
    fiber: { entry: { id: 'quota-test' } },
    get: key => key === 'configEditor' ? options.editor ?? { edit: async (entry, change) => { calls.push(['edit', entry, change({ preserved: 1 })]); } } : undefined,
    on: (name, listener) => listeners.set(name, listener),
  };
  const request = async (url, headers, opts) => {
    calls.push(['request', url, headers, opts]);
    if (options.request) return options.request(url, headers, opts);
    return { balance_infos: [{ currency: 'USD', total_balance: '8' }] };
  };
  const backend = createQuotaBackend(ctx, options.config ?? {}, { now: () => time, request });
  return { backend, ctx, calls, directory, descriptors, profiles, advance: n => { time += n; }, emit: name => listeners.get(name)?.() };
}
const requests = f => f.calls.filter(c => c[0] === 'request');

test('account sorting uses display names, ignores case, compares numbers naturally and preserves source arrays', () => {
  const input = [
    { id: 'z', name: 'Z.ai' }, { id: 'ten', name: 'Account 10' },
    { id: 'beta', name: 'beta' }, { id: 'two', name: 'account 2' },
    { id: 'fallback' }, { id: 'cyr-b', name: 'Бета' }, { id: 'cyr-a', name: 'Альфа' },
  ];
  const before = structuredClone(input);
  assert.deepEqual(sortProvidersByName(input).map(row => row.id), ['cyr-a', 'cyr-b', 'two', 'ten', 'beta', 'fallback', 'z']);
  assert.deepEqual(input, before);
  assert.deepEqual(sortProvidersByName([{id:'b',name:'Same'}, {id:'a',name:'same'}]).map(row => row.id), ['a', 'b']);
});

test('snapshot accounts are alphabetical for every UI consumer, including cached snapshots', async () => {
  const f = fixture({profiles:{zeta:{displayName:'Zeta',apiKeyEnv:'Z'},alpha:{displayName:'Alpha',apiKeyEnv:'A'},beta:{displayName:'Beta',apiKeyEnv:'B'}}});
  assert.deepEqual((await f.backend.snapshot()).providers.map(row => row.id), ['alpha','beta','zeta']);
  assert.deepEqual((await f.backend.snapshot()).providers.map(row => row.id), ['alpha','beta','zeta']);
});

test('defaults and configured profile discovery exclude dormant directory entries', async () => {
  const f = fixture();
  f.directory.push({ provider: 'dormant', settingsNs: 'models', settingsPath: ['providers', 'dormant'], defaultBaseURL: 'https://api.deepseek.com' });
  const result = await f.backend.snapshot();
  assert.equal(result.providers.length, 1);
  assert.equal(result.providers[0].status, 'ok');
  assert.deepEqual(result.settings, DEFAULT_SETTINGS);
  assert.deepEqual(f.calls.find(c => c[0] === 'describe-settings')[1], { redactSecrets: true });
  assert.equal(requests(f).length, 1);
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
});

test('DeepSeek whole-section path is supported, null/inherited/missing profile is not', () => {
  const entries = [{ provider: 'deepseek', settingsNs: 'deep', settingsPath: [] }];
  assert.equal(configuredRoutes(entries, [{ ns: 'deep', value: { apiKeyEnv: 'SAVED' } }]).length, 1);
  assert.equal(configuredRoutes(entries, [{ ns: 'deep', value: null }]).length, 0);
  assert.equal(configuredRoutes([{ ...entries[0], settingsPath: ['constructor'] }], [{ ns: 'deep', value: {} }]).length, 0);
});

test('ambient sources are not even resolved, including environment and dotenv layers', async () => {
  for (const source of ['env', 'environment', 'project-env', 'user-env', '.env', undefined]) {
    const f = fixture({ source: source ?? 'unknown' });
    const result = await f.backend.snapshot();
    assert.equal(result.providers[0].status, 'missing-auth');
    assert.equal(result.providers[0].reasonCode, 'stored-credential-required');
    assert.equal(f.calls.filter(c => c[0] === 'resolve').length, 0);
    assert.equal(requests(f).length, 0);
  }
});

test('source changed between describe and resolve never reaches network', async () => {
  const f = fixture({ source: 'file', resolvedSource: 'env' });
  const result = await f.backend.snapshot();
  assert.equal(result.providers[0].status, 'missing-auth');
  assert.equal(requests(f).length, 0);
});

test('explicit refs override native env and record without scanning anything else', async () => {
  const f = fixture();
  await f.backend.snapshot();
  assert.deepEqual(f.calls.filter(c => c[0] === 'describe').map(c => c[1]), ['SAVED_DEEPSEEK']);
  assert.equal(f.calls.filter(c => c[0] === 'record').length, 0);
});

test('Models native key records are scoped exactly and no arbitrary env members are read', async () => {
  const f = fixture({ profiles: { deepseek: {} }, record: { kind: 'api-key', key: 'synthetic-stored-key', env: { OTHER_SECRET: 'not-used' } } });
  await f.backend.snapshot();
  assert.deepEqual(f.calls.filter(c => c[0] === 'record').map(c => c[1]), ['llm-pi-ai/deepseek']);
  assert.equal(requests(f)[0][2].authorization, 'Bearer synthetic-stored-key');
  assert.equal(f.calls.filter(c => c[0] === 'resolve').length, 0);
});

test('unknown/custom endpoints and disabled providers do not access any credential', async () => {
  for (const options of [{ profiles: { deepseek: { baseURL: 'https://proxy.example/v1', apiKeyEnv: 'SAVED' } } }, { config: { disabledProviders: ['deepseek'] } }]) {
    const f = fixture(options);
    const result = await f.backend.snapshot();
    assert.ok(['disabled', 'unsupported'].includes(result.providers[0].status));
    assert.equal(f.calls.filter(c => ['resolve', 'describe', 'record', 'request'].includes(c[0])).length, 0);
  }
});

test('cache is singleflight across HTTP/tool callers and force has a 10-second cooldown', async () => {
  const f = fixture();
  const results = await Promise.all([f.backend.snapshot(), f.backend.snapshot(), f.backend.refresh()]);
  assert.equal(requests(f).length, 1);
  assert.deepEqual(results[0], results[1]);
  results[0].providers[0].balances[0].remaining = 999;
  assert.equal((await f.backend.snapshot()).providers[0].balances[0].remaining, 8);
  await f.backend.refresh();
  assert.equal(requests(f).length, 1);
  f.advance(10001);
  await f.backend.refresh();
  assert.equal(requests(f).length, 2);
  f.advance(300001);
  await f.backend.snapshot();
  assert.equal(requests(f).length, 3);
});

test('provider errors are sanitized, stale success retains timestamp and expires within one hour', async () => {
  let fail = false;
  const f = fixture({ request: () => { if (fail) throw new Error('SECRET token raw provider error'); return { balance_infos: [{ currency: 'USD', total_balance: 8 }] }; } });
  const first = await f.backend.snapshot();
  fail = true;
  f.advance(10001);
  const stale = await f.backend.refresh();
  assert.equal(stale.providers[0].status, 'stale');
  assert.equal(stale.providers[0].checkedAt, first.providers[0].checkedAt);
  assert.equal(stale.providers[0].reasonCode, 'network-error');
  assert.ok(!JSON.stringify(stale).includes('SECRET'));
  f.advance(3600001);
  const expired = await f.backend.refresh();
  assert.equal(expired.providers[0].status, 'error');
  assert.deepEqual(expired.providers[0].balances, []);
});

test('auth rejection drops prior metrics; credential and settings events invalidate cache', async () => {
  let rejected = false;
  const f = fixture({ request: () => { if (rejected) throw new QuotaError('auth-failed'); return { balance_infos: [{ currency: 'USD', total_balance: 8 }] }; } });
  await f.backend.snapshot();
  rejected = true;
  f.emit('credentials/reference-updated');
  const result = await f.backend.snapshot();
  assert.equal(requests(f).length, 2);
  assert.equal(result.providers[0].status, 'missing-auth');
  assert.deepEqual(result.providers[0].balances, []);
  f.emit('settings/document-updated');
  await f.backend.snapshot();
  assert.equal(requests(f).length, 3);
});

test('OAuth reads only the configured grant record, refuses expiry/override and never refreshes', async () => {
  const directory = [{ provider: 'openai-codex', settingsNs: 'models', settingsPath: ['providers', 'openai-codex'], defaultBaseURL: 'https://chatgpt.com/backend-api', nativeAuth: { env: [], oauth: true } }];
  const f = fixture({ profiles: { 'openai-codex': {} }, directory, record: { kind: 'grant', payload: { type: 'oauth', access: 'synthetic-oauth', refresh: 'DO-NOT-READ', expires: 1800000010000, accountId: 'account-1' } }, request: () => ({ rate_limit: { primary_window: { used_percent: 20 } } }) });
  assert.equal((await f.backend.snapshot()).providers[0].status, 'ok');
  assert.equal(requests(f)[0][1], 'https://chatgpt.com/backend-api/wham/usage');
  assert.equal(requests(f)[0][2]['chatgpt-account-id'], 'account-1');
  assert.deepEqual(f.calls.filter(c => c[0] === 'record').map(c => c[1]), ['llm-pi-ai/openai-codex']);
  f.advance(10001);
  assert.equal((await f.backend.refresh()).providers[0].status, 'reauth-required');
  assert.equal(requests(f).length, 1);
  f.profiles['openai-codex'].apiKeyEnv = 'OVERRIDE';
  const count = f.calls.filter(c => c[0] === 'record').length;
  assert.equal((await f.backend.snapshot()).providers[0].status, 'unsupported');
  assert.equal(f.calls.filter(c => c[0] === 'record').length, count);
});

test('bounded concurrency performs at most four network checks at once', async () => {
  let active = 0;
  let max = 0;
  const profiles = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`route-${i}`, { apiKeyEnv: `KEY_${i}` }]));
  const f = fixture({ profiles, request: async () => {
    active++; max = Math.max(max, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return { balance_infos: [{ currency: 'USD', total_balance: 1 }] };
  } });
  assert.equal((await f.backend.snapshot()).providers.length, 12);
  assert.equal(max, 4);
});

test('configuration changes exclude removed providers even inside cache TTL', async () => {
  const f = fixture();
  await f.backend.snapshot();
  delete f.profiles.deepseek;
  assert.deepEqual((await f.backend.snapshot()).providers, []);
});

test('settings validate patch and persist only own entry, preserving unrelated config', async () => {
  const f = fixture();
  const result = await f.backend.updateSettings({ mode: 'worst', showBar: false });
  assert.equal(result.settings.mode, 'worst');
  assert.equal(result.settings.showBar, false);
  const edit = f.calls.find(c => c[0] === 'edit');
  assert.equal(edit[1], f.ctx.fiber.entry);
  assert.deepEqual(edit[2], { preserved: 1, mode: 'worst', showBar: false });
  assert.equal(requests(f).length, 0);
  for (const patch of [null, [], { apiKey: 'SECRET' }, { refreshSeconds: 59 }, { refreshSeconds: 3601 }, { mode: 'oops' }, { disabledProviders: [123] }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => validatePatch(patch), /invalid-settings/);
});

test('settings persistence failure is explicit, sanitized and leaves previous values active', async () => {
  const f = fixture({ editor: { edit: () => { throw new Error('raw secret error'); } } });
  await assert.rejects(f.backend.updateSettings({ mode: 'worst' }), /settings-save-failed/);
  assert.equal((await f.backend.snapshot()).settings.mode, 'all');
  f.ctx.get = () => undefined;
  await assert.rejects(f.backend.updateSettings({ mode: 'worst' }), /settings-unavailable/);
});

test('plugin registers exact auth-gated HTTP routes and a structured shared-operation tool', async () => {
  const f = fixture({ config: { disabledProviders: ['deepseek'] } });
  const routes = new Map();
  const effects = [];
  let tool;
  f.ctx.effect = factory => { const dispose = factory(); effects.push(dispose); return dispose; };
  f.ctx.connection = { fetch: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path); } } };
  f.ctx.tools = { register: definition => { tool = definition; return () => {}; } };
  apply(f.ctx, { disabledProviders: ['deepseek'] });
  assert.deepEqual(inject, ['connection', 'llm', 'settings', 'credentials', 'tools']);
  assert.deepEqual([...routes.keys()], ['/api/llm-quota/snapshot', '/api/llm-quota/refresh', '/api/llm-quota/settings']);
  assert.ok(tool.output.schema);
  assert.equal(SNAPSHOT_SCHEMA.properties.providers.items.properties.reasonCode.type, 'string');
  const snapshot = await routes.get('/api/llm-quota/snapshot').fetch(new Request('http://localhost/api/llm-quota/snapshot'));
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.headers.get('cache-control'), 'no-store');
  const httpValue = await snapshot.json();
  assert.deepEqual(await tool.execute({ action: 'read' }), httpValue);
  assert.equal(tool.output.render({}, httpValue)[0].type, 'text');
  assert.ok((await tool.execute({ action: 'settings', patch: { token: 'never-echo' } })).error);
  const settingsRoute = routes.get('/api/llm-quota/settings');
  const saved = await settingsRoute.fetch(new Request('http://localhost/api/llm-quota/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"mode":"worst"}' }));
  assert.equal((await saved.json()).settings.mode, 'worst');
  const invalid = await settingsRoute.fetch(new Request('http://localhost/api/llm-quota/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"apiKey":"SECRET"}' }));
  assert.equal(invalid.status, 400);
  assert.ok(!(await invalid.text()).includes('SECRET'));
  const huge = await settingsRoute.fetch(new Request('http://localhost/api/llm-quota/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ disabledProviders: ['x'.repeat(18000)] }) }));
  assert.equal(huge.status, 400);
  for (const dispose of effects.reverse()) await dispose?.();
  assert.equal(routes.size, 0);
});
