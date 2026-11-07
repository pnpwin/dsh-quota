import { adapterFor, fetchQuota, QuotaError, requestJSON } from './providers.js';

export const DEFAULT_SETTINGS = Object.freeze({
  showBar: true, mode: 'all', showReset: true, refreshSeconds: 300,
  disabledProviders: Object.freeze([]), resetFormat: 'relative',
});
export const SETTINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    showBar: { type: 'boolean' }, mode: { type: 'string', enum: ['all', 'worst'] },
    showReset: { type: 'boolean' }, refreshSeconds: { type: 'integer', description: 'Refresh interval in seconds, from 60 to 3600.' },
    disabledProviders: { type: 'array', items: { type: 'string' }, description: 'Configured provider ids excluded from network checks.' },
    resetFormat: { type: 'string', enum: ['relative', 'absolute'] },
  },
};
const REASONS = Object.freeze({
  unsupported: 'No verified read-only quota API for this configured endpoint.',
  disabled: 'Disabled in quota settings.',
  'stored-credential-required': 'Save an API key in Models; environment and .env credentials are not used.',
  'credential-unavailable': 'Stored credential could not be read.',
  'needs-sign-in': 'Sign in again in Models; this plugin never refreshes OAuth tokens.',
  'auth-failed': 'Provider rejected the saved credential. Check Models.',
  'no-metrics': 'Provider returned no usable quota or balance metrics.',
  'no-subscription': 'No active subscription was reported by the provider.',
  'invalid-response': 'Provider returned an unrecognized response.',
  'response-too-large': 'Provider response exceeded the 1 MiB limit.',
  'provider-http-error': 'Provider quota endpoint is temporarily unavailable.',
  'rate-limited': 'Provider quota endpoint rate limited the request.',
  timeout: 'Provider quota check timed out.',
  cancelled: 'Quota check was cancelled.',
  'network-error': 'Provider quota endpoint could not be reached.',
  'configuration-unavailable': 'Models configuration could not be read.',
  'invalid-settings': 'Invalid quota settings patch.',
  'settings-unavailable': 'This profile cannot persist plugin settings.',
  'settings-save-failed': 'Settings could not be saved; previous values remain active.',
});
export function safeError(error, fallback = 'network-error') {
  const code = error instanceof QuotaError && Object.hasOwn(REASONS, error.code) ? error.code : fallback;
  return { code, message: REASONS[code] };
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function validatePatch(patch) {
  if (!isObject(patch) || Object.keys(patch).length > 6) throw new QuotaError('invalid-settings');
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new QuotaError('invalid-settings');
    if (['showBar', 'showReset'].includes(key) && typeof value !== 'boolean') throw new QuotaError('invalid-settings');
    if (key === 'mode' && !['all', 'worst'].includes(value)) throw new QuotaError('invalid-settings');
    if (key === 'resetFormat' && !['relative', 'absolute'].includes(value)) throw new QuotaError('invalid-settings');
    if (key === 'refreshSeconds' && (!Number.isInteger(value) || value < 60 || value > 3600)) throw new QuotaError('invalid-settings');
    if (key === 'disabledProviders' && (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string' || !id.length || id.length > 256 || /[\x00-\x1f]/.test(id)))) throw new QuotaError('invalid-settings');
    clean[key] = Array.isArray(value) ? [...new Set(value)] : value;
  }
  return clean;
}
function atPath(value, path) {
  for (const segment of path) {
    if (!isObject(value) || typeof segment !== 'string' || !Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}
/** Only entries with an actually configured profile participate; directory-only routes are dormant. */
export function configuredRoutes(directory, descriptors) {
  const values = new Map(descriptors.map(item => [item.ns, item.value]));
  const routes = [];
  const ids = new Set();
  for (const entry of directory) {
    if (typeof entry?.provider !== 'string' || entry.provider.length > 256 || !Array.isArray(entry.settingsPath) || !values.has(entry.settingsNs)) continue;
    const profile = atPath(values.get(entry.settingsNs), entry.settingsPath);
    if (!isObject(profile) || ids.has(entry.provider)) continue;
    ids.add(entry.provider);
    routes.push({ directory: entry, profile });
    if (routes.length === 100) break;
  }
  return routes;
}
function usableToken(value) { return typeof value === 'string' && value.length > 0 && value.length <= 32768 && /^[\x21-\x7e]+$/.test(value); }
function accountId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value) ? value : undefined; }
/** Never resolve an ambient credential, and recheck source after resolve to close source-change races. */
export async function storedAuth(credentials, route, adapter, now) {
  if (adapter.oauth) {
    // An explicit reference overrides native OAuth in Models. Never silently query another account's grant.
    if (route.profile.apiKeyEnv !== undefined) throw new QuotaError('unsupported');
    if (route.directory.nativeAuth?.oauth !== true) throw new QuotaError('needs-sign-in');
    const id = route.directory.provider;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new QuotaError('needs-sign-in');
    let record;
    try { record = await credentials.readRecord(`llm-pi-ai/${id}`); }
    catch { throw new QuotaError('credential-unavailable'); }
    const grant = record?.kind === 'grant' ? record.payload : undefined;
    if (!isObject(grant) || grant.type !== 'oauth') throw new QuotaError('needs-sign-in');
    // pi-ai OAuth fields are checked here without invoking any pi-ai auth resolver.
    const token = grant.access;
    const expires = grant.expires;
    if (!usableToken(token) || typeof expires !== 'number' || !Number.isFinite(expires) || expires <= now) throw new QuotaError('needs-sign-in');
    return { token, ...(accountId(grant.accountId) ? { accountId: grant.accountId } : {}) };
  }
  const explicit = route.profile.apiKeyEnv;
  // Native Models sign-in may store a key record rather than a reference. Only
  // built-in, configured pi-ai routes can address their own adapter-owned record.
  const id = route.directory.provider;
  const nativeIds = ['deepseek', 'moonshotai', 'moonshotai-cn', 'kimi-coding', 'zai', 'zai-coding-cn', 'openrouter'];
  if (explicit === undefined && nativeIds.includes(id) && route.directory.nativeAuth && route.directory.settingsPath?.length === 2 && route.directory.settingsPath[0] === 'providers' && route.directory.settingsPath[1] === id) {
    try {
      const record = await credentials.readRecord(`llm-pi-ai/${id}`);
      if (record?.kind === 'api-key' && usableToken(record.key)) return { token: record.key };
    } catch { throw new QuotaError('credential-unavailable'); }
  }
  const refs = explicit !== undefined ? [explicit] : route.directory.nativeAuth?.env ?? [];
  for (const ref of refs) {
    if (typeof ref !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) continue;
    try {
      const info = await credentials.describe(ref);
      if (info?.configured !== true || info.source !== 'file') continue;
      const resolved = await credentials.resolve(ref);
      if (resolved?.source === 'file' && usableToken(resolved.value)) return { token: resolved.value };
    } catch { throw new QuotaError('credential-unavailable'); }
  }
  throw new QuotaError('stored-credential-required');
}
function fingerprint(routes) {
  // Deliberately excludes secret configuration values and never stores an entire settings descriptor.
  return JSON.stringify(routes.map(({ directory: d, profile: p }) => [d.provider, d.displayName, d.defaultBaseURL, d.nativeAuth, p.baseURL, p.apiKeyEnv, p.displayName]));
}
function publicRow(route, adapter) {
  const name = route.profile.displayName ?? route.directory.displayName ?? route.directory.provider;
  return { id: route.directory.provider, name: typeof name === 'string' ? name.slice(0, 160) : route.directory.provider, kind: adapter?.kind ?? 'unsupported', windows: [], balances: [] };
}
const accountCollator = new Intl.Collator(['ru', 'en'], { sensitivity: 'base', numeric: true });
/** Return alphabetically ordered accounts without mutating a shared snapshot. */
export function sortProvidersByName(providers) {
  return [...providers].sort((a, b) => accountCollator.compare(a.name || a.id, b.name || b.id) || accountCollator.compare(a.id, b.id));
}
function failedRow(base, code, previous, checkedAt, now = Date.now()) {
  const auth = ['needs-sign-in', 'auth-failed', 'stored-credential-required', 'credential-unavailable'].includes(code);
  // Credentials/configuration problems never retain potentially misleading old metrics.
  if (!auth && previous && ['ok', 'stale'].includes(previous.status) && now - Date.parse(previous.checkedAt) <= 3600000) return { ...previous, status: 'stale', reasonCode: code, reason: REASONS[code] ?? REASONS['network-error'] };
  return { ...base, status: code === 'unsupported' ? 'unsupported' : code === 'disabled' ? 'disabled' : code === 'needs-sign-in' ? 'reauth-required' : auth ? 'missing-auth' : 'error', reasonCode: code, reason: REASONS[code] ?? REASONS['network-error'], ...(checkedAt ? { checkedAt } : {}) };
}

/** Shared application operations for HTTP and tools. Dependencies are injectable solely for isolated tests. */
export function createQuotaBackend(ctx, config = {}, deps = {}) {
  let settings = { ...DEFAULT_SETTINGS, ...validatePatch(config), disabledProviders: [...(config.disabledProviders ?? [])] };
  const now = deps.now ?? Date.now;
  const request = deps.request ?? requestJSON;
  let cache;
  let cacheFingerprint;
  let completedAt = -Infinity;
  let lastAttempt = -Infinity;
  let inFlight;
  let disposed = false;
  const controller = new AbortController();
  let generation = 0;
  let active;
  const clone = value => structuredClone(value);
  const invalidate = () => {
    generation++;
    cache = undefined;
    cacheFingerprint = undefined;
    completedAt = -Infinity;
    lastAttempt = -Infinity;
    active?.abort();
  };
  // Subscribe only to the credential/config seams; never inspect their backing files.
  ctx.on?.('credentials/reference-updated', invalidate);
  ctx.on?.('credentials/record-updated', invalidate);
  ctx.on?.('settings/document-updated', invalidate);

  async function snapshot(force = false) {
    if (disposed) throw new QuotaError('cancelled');
    if (inFlight) return clone(await inFlight);
    let routes;
    try { routes = configuredRoutes(await ctx.llm.listConfigurableProviders(), await ctx.settings.describe({ redactSecrets: true })); }
    catch { throw new QuotaError('configuration-unavailable'); }
    // Discovery is asynchronous too; another caller may have started probing meanwhile.
    if (inFlight) return clone(await inFlight);
    const key = fingerprint(routes);
    const current = now();
    const staleExpired = cache?.providers.some(row => row.status === 'stale' && current - Date.parse(row.checkedAt) > 3600000);
    if (cache && !staleExpired && key === cacheFingerprint && (current - completedAt < (force ? 10000 : settings.refreshSeconds * 1000) || current - lastAttempt < 10000)) return clone({ ...cache, settings });
    const previous = key === cacheFingerprint ? cache : undefined;
    lastAttempt = current;
    const run = async () => {
      const epoch = generation;
      const group = new AbortController();
      active = group;
      const signal = AbortSignal.any([controller.signal, group.signal]);
      const timer = setTimeout(() => group.abort(), 11000);
      const probe = async route => {
        const adapter = adapterFor(route);
        const base = publicRow(route, adapter);
        if (settings.disabledProviders.includes(base.id)) return failedRow(base, 'disabled');
        if (!adapter) return failedRow(base, 'unsupported');
        const checkedAt = new Date(now()).toISOString();
        try {
          if (signal.aborted) throw new QuotaError('timeout');
          const auth = await storedAuth(ctx.credentials, route, adapter, now());
          if (signal.aborted) throw new QuotaError('timeout');
          const result = await fetchQuota(adapter, auth, request, signal);
          return { ...base, ...result, status: 'ok', checkedAt };
        } catch (error) {
          let { code } = safeError(error);
          if (adapter.oauth && code === 'auth-failed') code = 'needs-sign-in';
          if (signal.aborted) code = 'timeout';
          return failedRow(base, code, previous?.providers.find(item => item.id === base.id), checkedAt, now());
        }
      };
      const providers = new Array(routes.length);
      let cursor = 0;
      try {
        await Promise.all(Array.from({ length: Math.min(4, routes.length) }, async () => {
          while (cursor < routes.length) { const i = cursor++; providers[i] = await probe(routes[i]); }
        }));
        if (generation !== epoch || disposed) throw new QuotaError('configuration-unavailable');
        completedAt = now();
        cacheFingerprint = key;
        cache = { providers: sortProvidersByName(providers), settings: clone(settings), updatedAt: new Date(completedAt).toISOString() };
        return cache;
      } finally { clearTimeout(timer); if (active === group) active = undefined; }
    };
    // Assign before executing work so concurrent HTTP/tool calls join the same probe.
    inFlight = Promise.resolve().then(run);
    try { return clone(await inFlight); } finally { inFlight = undefined; }
  }
  async function updateSettings(patch) {
    const clean = validatePatch(patch);
    const entry = ctx.fiber?.entry;
    const editor = ctx.get?.('configEditor');
    if (entry === undefined || editor === undefined) throw new QuotaError('settings-unavailable');
    const before = cache;
    try { await editor.edit(entry, current => ({ ...current, ...clean })); }
    catch { throw new QuotaError('settings-save-failed'); }
    settings = { ...settings, ...clean };
    // The editor can remount this plugin and invalidate its cache. Preserve a
    // display-only reply, without restoring an invalidated credential cache.
    const providers = clone(cache?.providers ?? before?.providers ?? []).map(row => settings.disabledProviders.includes(row.id) ? failedRow({ id: row.id, name: row.name, kind: row.kind, windows: [], balances: [] }, 'disabled') : row);
    cache = cache ? { ...cache, providers, settings: clone(settings) } : undefined;
    if (Object.hasOwn(clean, 'disabledProviders')) { cacheFingerprint = undefined; completedAt = -Infinity; }
    return { providers, settings: clone(settings), updatedAt: cache?.updatedAt ?? before?.updatedAt ?? new Date(now()).toISOString() };
  }
  return { snapshot: () => snapshot(false), refresh: () => snapshot(true), updateSettings, dispose() { disposed = true; controller.abort(); } };
}
