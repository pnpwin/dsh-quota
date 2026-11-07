import https from 'node:https';

// Fixed public read-only endpoints. Never derive request URLs from profile text.
const ENDPOINTS = new Set([
  'https://api.deepseek.com/user/balance',
  'https://api.moonshot.ai/v1/users/me/balance',
  'https://api.moonshot.cn/v1/users/me/balance',
  'https://api.kimi.com/coding/v1/usages',
  'https://chatgpt.com/backend-api/wham/usage',
  'https://api.z.ai/api/monitor/usage/quota/limit',
  'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
  'https://bigmodel.cn/api/monitor/usage/quota/limit',
  'https://openrouter.ai/api/v1/key',
]);
export const MAX_BYTES = 1024 * 1024;
export const TIMEOUT_MS = 7000;
export class QuotaError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Direct HTTPS deliberately bypasses ambient proxy/global Fetch dispatchers. */
export function requestJSON(url, headers = {}, { signal } = {}) {
  if (!ENDPOINTS.has(url)) return Promise.reject(new QuotaError('unsupported-endpoint'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => { req?.destroy(); finish(new QuotaError('cancelled')); };
    const timer = setTimeout(() => { req?.destroy(); finish(new QuotaError('timeout')); }, TIMEOUT_MS);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      req = https.request(url, {
        method: 'GET', agent: false,
        headers: { accept: 'application/json', 'user-agent': 'HermesAgent', ...headers },
      }, response => {
        // HTTPS request does not follow redirects. Refuse them before reading a body.
        if (response.statusCode !== 200) {
          response.destroy();
          finish(new QuotaError(response.statusCode === 401 || response.statusCode === 403 ? 'auth-failed' : response.statusCode === 429 ? 'rate-limited' : 'provider-http-error'));
          return;
        }
        if (Number(response.headers['content-length']) > MAX_BYTES) {
          response.destroy(); finish(new QuotaError('response-too-large')); return;
        }
        let size = 0;
        const chunks = [];
        response.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_BYTES) { response.destroy(); finish(new QuotaError('response-too-large')); }
          else chunks.push(chunk);
        });
        response.on('end', () => {
          try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch { finish(new QuotaError('invalid-response')); }
        });
        response.on('error', () => finish(new QuotaError('network-error')));
        response.on('aborted', () => finish(new QuotaError('network-error')));
      });
      req.on('error', () => finish(new QuotaError('network-error')));
      req.end();
    } catch { finish(new QuotaError('network-error')); }
  });
}

export function numeric(value) {
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) && value.length < 80) value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function percent(value) { const n = numeric(value); return n !== undefined && n >= 0 && n <= 100 ? n : undefined; }
function iso(value, unit = 'iso') {
  const n = unit === 'iso' ? (typeof value === 'string' ? Date.parse(value) : NaN) : (numeric(value) ?? NaN) * (unit === 'seconds' ? 1000 : 1);
  return Number.isFinite(n) && n >= 0 && n <= 8640000000000000 ? new Date(n).toISOString() : undefined;
}
function window(id, label, remainingPercent, resetsAt) {
  return { id, label, remainingPercent, ...(resetsAt ? { resetsAt } : {}) };
}
function metrics(windows = [], balances = [], extra = {}) {
  if (!windows.length && !balances.length) throw new QuotaError('no-metrics');
  return { windows, balances, ...extra };
}
export function parseDeepSeek(body) {
  if (!Array.isArray(body?.balance_infos)) throw new QuotaError('no-metrics');
  const seen = new Set();
  const balances = [];
  for (const item of body.balance_infos) {
    if (!['USD', 'CNY'].includes(item?.currency)) continue;
    if (seen.has(item.currency)) throw new QuotaError('invalid-response');
    seen.add(item.currency);
    const remaining = numeric(item.total_balance);
    if (remaining !== undefined) balances.push({ currency: item.currency, remaining });
  }
  return metrics([], balances, { notes: ['API credit balance; not a subscription quota.'] });
}
export function parseMoonshot(body, currency = 'USD') {
  if (body?.code !== 0 || body?.status !== true) throw new QuotaError('invalid-response');
  const remaining = numeric(body?.data?.available_balance);
  if (remaining === undefined) throw new QuotaError('no-metrics');
  return metrics([], [{ currency, remaining }], { notes: ['API credit balance; not a Kimi Coding quota.'] });
}
export function parseKimi(body) {
  const windows = [];
  for (const [key, label] of [['limit_5h', '5 hours'], ['limit_month_total', 'Monthly total'], ['limit_month_code', 'Monthly coding']]) {
    const raw = body?.usages?.[key];
    const ratio = numeric(raw?.used_ratio);
    const used = ratio === undefined ? undefined : percent(ratio * 100);
    if (used !== undefined) windows.push(window(key, label, 100 - used, iso(raw.reset_time)));
  }
  const canonicalSession = windows.find(item => item.id === 'limit_5h');
  if (Array.isArray(body?.limits)) for (const [index, raw] of body.limits.slice(0, 20).entries()) {
    const detail = raw?.detail ?? {};
    const limit = numeric(raw?.limit ?? detail.limit);
    const remaining = numeric(raw?.remaining ?? detail.remaining);
    const used = numeric(raw?.used ?? detail.used);
    const p = limit > 0 ? percent(remaining !== undefined ? remaining / limit * 100 : used !== undefined ? (1 - used / limit) * 100 : undefined) : undefined;
    if (p === undefined) continue;
    const session = raw?.window?.duration === 300 && raw?.window?.timeUnit === 'TIME_UNIT_MINUTE';
    const scope = raw?.scope;
    const scoped = scope != null && (typeof scope !== 'string' || scope.trim() !== '');
    const resetsAt = iso(raw?.resetTime ?? detail.resetTime);
    // The unscoped 300-minute limit mirrors usages.limit_5h. Prefer the
    // structured ratio, not label/value equality: rounding and reset precision vary.
    // Explicit scopes, monthly limits and unknown windows remain independent.
    if (canonicalSession && session && !scoped) {
      if (!canonicalSession.resetsAt && resetsAt) canonicalSession.resetsAt = resetsAt;
      continue;
    }
    windows.push(window(`limit-${index}`, session ? '5 hours' : 'Usage limit', p, resetsAt));
  }
  return metrics(windows);
}
export function parseCodex(body) {
  const windows = [];
  function add(rate, prefix = '', labelPrefix = '') {
    for (const [key, fallback] of [['primary_window', 'Primary window'], ['secondary_window', 'Secondary window']]) {
      const raw = rate?.[key];
      const used = percent(raw?.used_percent);
      if (used === undefined) continue;
      const label = raw.limit_window_seconds === 18000 ? '5 hours' : raw.limit_window_seconds === 604800 ? 'Weekly' : fallback;
      windows.push(window(prefix + key, labelPrefix + label, 100 - used, iso(raw.reset_at, 'seconds')));
    }
  }
  add(body?.rate_limit);
  if (Array.isArray(body?.additional_rate_limits)) body.additional_rate_limits.slice(0, 10).forEach((item, i) => add(item?.rate_limit, `extra-${i}-`, 'Additional: '));
  const balances = [];
  const balance = numeric(body?.credits?.balance);
  if (balance !== undefined) balances.push({ currency: 'credits', remaining: balance });
  const plan = ['free', 'go', 'plus', 'pro', 'team', 'business', 'enterprise', 'edu'].includes(body?.plan_type) ? body.plan_type : undefined;
  return metrics(windows, balances, plan ? { plan } : {});
}
export function parseZai(body) {
  if (body?.success === false) throw new QuotaError('no-subscription');
  if (body?.code !== undefined && body.code !== 200 && body.code !== '200') throw new QuotaError('invalid-response');
  const windows = [];
  if (Array.isArray(body?.data?.limits)) for (const [i, raw] of body.data.limits.slice(0, 20).entries()) {
    const session = raw?.type === 'TOKENS_LIMIT' && raw.unit === 3 && raw.number === 5;
    const weekly = raw?.type === 'TOKENS_LIMIT' && raw.unit === 6 && raw.number === 1;
    const monthly = raw?.type === 'TIME_LIMIT' && raw.unit === 5 && raw.number === 1;
    if (!session && !weekly && !monthly) continue;
    const cap = numeric(raw.usage);
    const current = numeric(raw.currentValue);
    const used = percent(raw.percentage) ?? (cap > 0 && current !== undefined ? percent(current / cap * 100) : undefined);
    if (used === undefined || (raw.type === 'TIME_LIMIT' && !(cap > 0))) continue;
    const label = session ? '5 hours' : weekly ? 'Weekly' : 'Monthly tools';
    windows.push(window(`limit-${i}`, label, 100 - used, iso(raw.nextResetTime, 'milliseconds')));
  }
  const plan = ['lite', 'pro', 'max'].includes(body?.data?.level) ? body.data.level : undefined;
  return metrics(windows, [], plan ? { plan } : {});
}
export function parseOpenRouter(body) {
  const raw = body?.data;
  const limit = numeric(raw?.limit);
  const remaining = numeric(raw?.limit_remaining);
  const used = numeric(raw?.usage);
  const balances = [];
  if (remaining !== undefined) balances.push({ currency: 'USD', remaining, ...(limit !== undefined ? { total: limit } : {}), ...(used !== undefined ? { used } : {}) });
  // Unlimited keys may expose usage but no remaining budget. Do not invent zero.
  const p = limit > 0 && remaining !== undefined ? percent(remaining / limit * 100) : undefined;
  return metrics(p === undefined ? [] : [window('key-limit', 'Key limit', p)], balances, { notes: ['API-key budget only; not the account wallet balance.'] });
}

const SPECS = [
  { kind: 'deepseek', bases: ['https://api.deepseek.com', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/anthropic'], endpoint: 'https://api.deepseek.com/user/balance', parse: parseDeepSeek },
  { kind: 'moonshot', bases: ['https://api.moonshot.ai/v1'], endpoint: 'https://api.moonshot.ai/v1/users/me/balance', parse: body => parseMoonshot(body, 'USD') },
  { kind: 'moonshot', bases: ['https://api.moonshot.cn/v1'], endpoint: 'https://api.moonshot.cn/v1/users/me/balance', parse: body => parseMoonshot(body, 'CNY') },
  { kind: 'kimi-coding', bases: ['https://api.kimi.com/coding/v1'], endpoint: 'https://api.kimi.com/coding/v1/usages', parse: parseKimi },
  { kind: 'codex', bases: ['https://chatgpt.com/backend-api', 'https://chatgpt.com/backend-api/codex'], endpoint: 'https://chatgpt.com/backend-api/wham/usage', parse: parseCodex, oauth: true },
  { kind: 'zai', bases: ['https://api.z.ai/api/coding/paas/v4', 'https://api.z.ai/api/paas/v4'], endpoint: 'https://api.z.ai/api/monitor/usage/quota/limit', parse: parseZai, rawAuth: true },
  { kind: 'zhipu', bases: ['https://open.bigmodel.cn/api/coding/paas/v4', 'https://open.bigmodel.cn/api/paas/v4'], endpoint: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit', parse: parseZai, rawAuth: true },
  { kind: 'zhipu', bases: ['https://bigmodel.cn/api/coding/paas/v4', 'https://bigmodel.cn/api/paas/v4'], endpoint: 'https://bigmodel.cn/api/monitor/usage/quota/limit', parse: parseZai, rawAuth: true },
  { kind: 'openrouter', bases: ['https://openrouter.ai/api/v1'], endpoint: 'https://openrouter.ai/api/v1/key', parse: parseOpenRouter },
];
export function adapterFor(route) {
  // The dedicated Models adapter declares no directory defaultBaseURL. Its
  // documented public default applies only to that exact whole-section route.
  const dedicatedDeepSeek = route.directory.provider === 'deepseek-official' && route.directory.settingsPath?.length === 0;
  const raw = route.profile.baseURL ?? route.directory.defaultBaseURL ?? (dedicatedDeepSeek ? 'https://api.deepseek.com/anthropic' : undefined);
  if (typeof raw !== 'string') return undefined;
  let url;
  try { url = new URL(raw); } catch { return undefined; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) return undefined;
  const base = url.href.replace(/\/+$/, '');
  return SPECS.find(spec => spec.bases.includes(base) && (!spec.oauth || route.directory.provider === 'openai-codex'));
}

export async function fetchQuota(adapter, auth, request = requestJSON, signal) {
  const headers = { authorization: adapter.rawAuth ? auth.token : `Bearer ${auth.token}` };
  if (adapter.oauth) {
    headers['user-agent'] = 'codex-cli';
    if (auth.accountId) headers['chatgpt-account-id'] = auth.accountId;
  }
  return adapter.parse(await request(adapter.endpoint, headers, { signal }));
}
