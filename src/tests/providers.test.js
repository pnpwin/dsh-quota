import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { adapterFor, numeric, parseDeepSeek, parseMoonshot, parseKimi, parseCodex, parseZai, parseOpenRouter, fetchQuota, requestJSON, MAX_BYTES, TIMEOUT_MS } from '../providers.js';

const route = (baseURL, provider = 'example') => ({ directory: { provider }, profile: { baseURL } });

test('adapter allowlist rejects proxies, arbitrary hosts, credentials, query, port and paths', () => {
  for (const base of ['http://api.deepseek.com', 'https://evil.example/v1', 'https://api.deepseek.com.evil.example', 'https://user:pass@api.deepseek.com', 'https://api.deepseek.com:444', 'https://api.deepseek.com?proxy=1', 'https://api.deepseek.com/#x', 'https://api.deepseek.com/proxy']) assert.equal(adapterFor(route(base)), undefined, base);
  assert.equal(adapterFor(route('https://api.deepseek.com/anthropic')).kind, 'deepseek');
  assert.equal(adapterFor(route('https://api.deepseek.com/v1/')).kind, 'deepseek');
  assert.equal(adapterFor(route('https://chatgpt.com/backend-api', 'openai')), undefined);
  assert.equal(adapterFor(route('https://chatgpt.com/backend-api', 'openai-codex')).kind, 'codex');
});

test('dedicated DeepSeek Models route uses its documented public default only when endpoint is absent', () => {
  const dedicated = {directory:{provider:'deepseek-official',settingsPath:[]},profile:{}};
  assert.equal(adapterFor(dedicated).kind, 'deepseek');
  assert.equal(adapterFor({...dedicated,profile:{baseURL:'https://proxy.example/anthropic'}}), undefined);
  assert.equal(adapterFor({directory:{provider:'deepseek-account',settingsPath:[]},profile:{}}), undefined);
  assert.equal(adapterFor({directory:{provider:'custom',settingsPath:[]},profile:{}}), undefined);
});

test('numeric values never convert null, empty, booleans or missing fields into zero', () => {
  for (const value of [null, undefined, '', ' ', true, false, 'NaN', Infinity, NaN, '1e999', {}, []]) assert.equal(numeric(value), undefined);
  assert.equal(numeric('0'), 0);
  assert.equal(numeric('-1.25'), -1.25);
});

test('DeepSeek parses currency balances independently with no invented percentages', () => {
  const value = parseDeepSeek({ balance_infos: [{ currency: 'USD', total_balance: '10.25', granted_balance: '5.0' }, { currency: 'CNY', total_balance: '0' }] });
  assert.deepEqual(value.balances, [{ currency: 'USD', remaining: 10.25 }, { currency: 'CNY', remaining: 0 }]);
  assert.deepEqual(value.windows, []);
  assert.throws(() => parseDeepSeek({ balance_infos: [{ currency: 'USD', total_balance: null }] }), /no-metrics/);
  assert.throws(() => parseDeepSeek({ balance_infos: [{ currency: 'USD', total_balance: 1 }, { currency: 'USD', total_balance: 2 }] }), /invalid-response/);
});

test('Moonshot uses available balance without summing debt and vouchers', () => {
  assert.deepEqual(parseMoonshot({ code: 0, status: true, data: { available_balance: 10, voucher_balance: 10, cash_balance: -20 } }, 'CNY').balances, [{ currency: 'CNY', remaining: 10 }]);
  assert.throws(() => parseMoonshot({ code: 1, status: false, data: { available_balance: 100 } }), /invalid-response/);
  assert.throws(() => parseMoonshot({ code: 0, status: true, data: { available_balance: null } }), /no-metrics/);
});

test('Kimi windows handle ratios, remaining preference and null metrics safely', () => {
  const value = parseKimi({ usages: { limit_5h: { used_ratio: 0.25, reset_time: '2026-11-08T00:00:00Z' } } });
  const legacy = parseKimi({ limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '99', remaining: '40' } }] });
  assert.equal(value.windows[0].remainingPercent, 75);
  assert.equal(legacy.windows[0].remainingPercent, 40);
  assert.equal(value.windows[0].resetsAt, '2026-11-08T00:00:00.000Z');
  for (const used_ratio of [null, undefined, -1, 1.1, true]) assert.throws(() => parseKimi({ usages: { limit_5h: { used_ratio } } }), /no-metrics/);
});

// Fixed synthetic responses: no captured account data or credentials.
const kimiReset = '2027-01-01T06:00:00.000Z';
const kimiLegacySession = overrides => ({
  window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
  detail: { limit: 100, remaining: 82 },
  resetTime: '2027-01-01T06:00:01.869Z',
  ...overrides,
});

test('Kimi mixed schemas emit one Session while preserving both independent monthly limits', () => {
  const value=parseKimi({
    usages:{
      limit_5h:{used_ratio:0.1784,reset_time:kimiReset},
      limit_month_total:{used_ratio:0.36,reset_time:'2027-02-01T00:00:00Z'},
      limit_month_code:{used_ratio:0.36,reset_time:'2027-02-01T00:00:00Z'},
    },
    limits:[kimiLegacySession()],
  });
  assert.deepEqual(value.windows.map(w=>w.id),['limit_5h','limit_month_total','limit_month_code']);
  assert.equal(value.windows.filter(w=>w.label==='5 hours').length,1);
  assert.equal(value.windows[0].remainingPercent,82.16);
  assert.equal(value.windows[0].resetsAt,kimiReset);
});

test('Kimi canonical Session at zero or full remaining still suppresses its legacy mirror', () => {
  for(const used_ratio of [0,1]) {
    const value=parseKimi({usages:{limit_5h:{used_ratio}},limits:[kimiLegacySession()]});
    assert.equal(value.windows.length,1);
    assert.equal(value.windows[0].id,'limit_5h');
    assert.equal(value.windows[0].remainingPercent,100-used_ratio*100);
  }
});

test('Kimi missing or invalid canonical Session falls back to usable legacy metrics', () => {
  for(const used_ratio of [undefined,null,-1,1.1,true,'invalid']) {
    const value=parseKimi({usages:{limit_5h:{used_ratio}},limits:[kimiLegacySession()]});
    assert.equal(value.windows.length,1);
    assert.equal(value.windows[0].label,'5 hours');
    assert.equal(value.windows[0].remainingPercent,82);
  }
});

test('Kimi canonical monthly metrics do not suppress a legacy-only Session', () => {
  const value=parseKimi({usages:{limit_month_total:{used_ratio:0.36}},limits:[kimiLegacySession()]});
  assert.deepEqual(value.windows.map(w=>w.label),['Monthly total','5 hours']);
});

test('Kimi deduplication retains explicitly scoped and unknown independent limits', () => {
  for(const scope of ['MODEL_GROUP_ALPHA','  MODEL_GROUP_ALPHA  ',{},0]) {
    const value=parseKimi({usages:{limit_5h:{used_ratio:0.18}},limits:[kimiLegacySession({scope})]});
    assert.equal(value.windows.length,2,'Explicit scope must not be inferred as a duplicate');
  }
  for(const window of [{duration:60,timeUnit:'TIME_UNIT_MINUTE'},{duration:5,timeUnit:'TIME_UNIT_HOUR'},{duration:300,timeUnit:'UNKNOWN_UNIT'}]) {
    const value=parseKimi({usages:{limit_5h:{used_ratio:0.18}},limits:[kimiLegacySession({window})]});
    assert.equal(value.windows.length,2,'Unknown window identity must be preserved even with equal values');
  }
});

test('Kimi duplicate Session can fill a missing reset without replacing its canonical percentage', () => {
  for(const scope of [undefined,null,'','  ']) {
    const value=parseKimi({usages:{limit_5h:{used_ratio:0.1784}},limits:[kimiLegacySession({scope})]});
    assert.equal(value.windows.length,1);
    assert.equal(value.windows[0].remainingPercent,82.16);
    assert.equal(value.windows[0].resetsAt,'2027-01-01T06:00:01.869Z');
  }
});

test('Codex parses reset epochs and excludes arbitrary plan text and raw labels', () => {
  const value = parseCodex({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 40, reset_at: 1800000000, limit_window_seconds: 18000 }, secondary_window: { used_percent: null } }, additional_rate_limits: [{ limit_name: 'secret-provider-string', rate_limit: { primary_window: { used_percent: 100 } } }] });
  assert.equal(value.plan, 'plus');
  assert.equal(value.windows.length, 2);
  assert.equal(value.windows[0].remainingPercent, 60);
  assert.equal(value.windows[0].resetsAt, '2027-01-15T08:00:00.000Z');
  assert.ok(!JSON.stringify(value).includes('secret-provider-string'));
  assert.throws(() => parseCodex({ rate_limit: { primary_window: { used_percent: null } } }), /no-metrics/);
  assert.equal(parseCodex({ plan_type: 'secret', credits: { balance: '4' } }).plan, undefined);
});

test('Zai rejects failed envelopes, validates percentages and distinguishes windows', () => {
  assert.throws(() => parseZai({ success: false }), /no-subscription/);
  const value = parseZai({ code: 200, success: true, data: { limits: [{ type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 20 }, { type: 'TOKENS_LIMIT', unit: 6, number: 1, usage: 100, currentValue: 40 }] } });
  assert.deepEqual(value.windows.map(w => w.remainingPercent), [80, 60]);
  assert.throws(() => parseZai({ data: { limits: [{ type: 'TOKENS_LIMIT', percentage: null }] } }), /no-metrics/);
});

test('OpenRouter key budget is not an account wallet or an invented unlimited percentage', () => {
  const value = parseOpenRouter({ data: { limit: 100, limit_remaining: 75, usage: 25 } });
  assert.equal(value.windows[0].remainingPercent, 75);
  assert.deepEqual(value.balances, [{ currency: 'USD', remaining: 75, total: 100, used: 25 }]);
  assert.throws(() => parseOpenRouter({ data: { limit: null, limit_remaining: null, usage: 1 } }), /no-metrics/);
  assert.equal(parseOpenRouter({ data: { limit: null, limit_remaining: 4 } }).windows.length, 0);
});

test('Zai/Zhipu send raw authorization only to exact configured regional endpoints', async () => {
  for (const host of ['api.z.ai', 'open.bigmodel.cn', 'bigmodel.cn']) {
    const adapter = adapterFor(route(`https://${host}/api/coding/paas/v4`));
    assert.ok(adapter);
    const calls = [];
    await fetchQuota(adapter, { token: 'synthetic.id.secret' }, async (url, headers) => {
      calls.push({ url, headers });
      return { code: 200, success: true, data: { level: 'pro', limits: [{ type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 1 }] } };
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://${host}/api/monitor/usage/quota/limit`);
    assert.equal(calls[0].headers.authorization, 'synthetic.id.secret');
  }
  assert.throws(() => parseZai({ data: { limits: [{ type: 'TOKENS_LIMIT', unit: 3, number: 999, percentage: 1 }] } }), /no-metrics/);
});

test('Moonshot regions never reuse a key across hosts or select Kimi Coding', async () => {
  for (const [host, currency] of [['api.moonshot.ai', 'USD'], ['api.moonshot.cn', 'CNY']]) {
    const adapter = adapterFor(route(`https://${host}/v1`));
    assert.equal(adapter.kind, 'moonshot');
    const calls = [];
    const value = await fetchQuota(adapter, { token: 'synthetic-regional' }, async (url, headers) => {
      calls.push({ url, headers });
      return { code: 0, status: true, data: { available_balance: 5 } };
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://${host}/v1/users/me/balance`);
    assert.equal(value.balances[0].currency, currency);
  }
});

function mockHttps(t, responseFactory) {
  const original = https.request;
  const calls = [];
  https.request = (url, options, callback) => {
    calls.push({ url, options });
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter();
      res.destroy = () => {};
      res.statusCode = 200;
      res.headers = {};
      responseFactory(res, () => callback(res));
    });
    return req;
  };
  t.after(() => { https.request = original; });
  return calls;
}

test('network transport uses only GET, direct HTTPS, no proxy/redirect support', async t => {
  const calls = mockHttps(t, (res, start) => { start(); res.emit('data', Buffer.from('{"balance":1}')); res.emit('end'); });
  assert.deepEqual(await requestJSON('https://api.deepseek.com/user/balance', { authorization: 'Bearer synthetic-test-key' }), { balance: 1 });
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.agent, false);
  assert.ok(TIMEOUT_MS <= 12000);
  await assert.rejects(requestJSON('https://evil.example/quota'), /unsupported-endpoint/);
  assert.equal(calls.length, 1);
});

test('redirect does not produce another secret-bearing request', async t => {
  const calls = mockHttps(t, (res, start) => { res.statusCode = 302; res.headers.location = 'https://evil.example/collect'; start(); });
  await assert.rejects(requestJSON('https://api.deepseek.com/user/balance', { authorization: 'Bearer synthetic' }), /provider-http-error/);
  assert.equal(calls.length, 1);
});

test('network rejects oversized declared and streamed responses without parsing', async t => {
  mockHttps(t, (res, start) => { start(); res.emit('data', Buffer.alloc(MAX_BYTES + 1)); res.emit('end'); });
  await assert.rejects(requestJSON('https://api.deepseek.com/user/balance'), /response-too-large/);
});

test('network abort is explicit and does not expose provider errors', async t => {
  mockHttps(t, () => {});
  const controller = new AbortController();
  const result = requestJSON('https://api.deepseek.com/user/balance', {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(result, /cancelled/);
});
