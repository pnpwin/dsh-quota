import { createQuotaBackend, safeError, SETTINGS_SCHEMA } from './backend.js';
import { QuotaError } from './providers.js';

export const inject = ['connection', 'llm', 'settings', 'credentials', 'tools'];
export { createQuotaBackend } from './backend.js';

const string = { type: 'string' };
const number = { type: 'number' };
export const SNAPSHOT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['providers', 'settings', 'updatedAt'],
  properties: {
    providers: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['id', 'name', 'kind', 'status', 'windows', 'balances'],
      properties: {
        id: string, name: string, kind: string,
        status: { type: 'string', enum: ['ok', 'stale', 'unsupported', 'disabled', 'error', 'missing-auth', 'reauth-required'] },
        reason: string, reasonCode: string, checkedAt: string, plan: string, notes: { type: 'array', items: string },
        windows: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['id', 'label', 'remainingPercent'],
          properties: { id: string, label: string, remainingPercent: { oneOf: [number, { type: 'null' }] }, resetsAt: string },
        } },
        balances: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['currency', 'remaining'],
          properties: { currency: string, remaining: number, total: number, used: number },
        } },
      },
    } },
    settings: { ...SETTINGS_SCHEMA, required: Object.keys(SETTINGS_SCHEMA.properties) },
    updatedAt: string,
  },
};
const ERROR_SCHEMA = { type: 'object', additionalProperties: false, required: ['error'], properties: {
  error: { type: 'object', additionalProperties: false, required: ['code', 'message'], properties: { code: string, message: string } },
} };
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
async function bodyPatch(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new QuotaError('invalid-settings');
  if (Number(request.headers.get('content-length')) > 16384) throw new QuotaError('invalid-settings');
  const reader = request.body?.getReader();
  if (!reader) throw new QuotaError('invalid-settings');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) throw new QuotaError('invalid-settings');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new QuotaError('invalid-settings'); }
  finally { await reader.cancel().catch(() => {}); }
}
export function apply(ctx, config = {}) {
  const backend = createQuotaBackend(ctx, config);
  ctx.effect(() => () => backend.dispose());
  const handle = operation => async request => {
    try { return json(await operation(request)); }
    catch (error) {
      const failure = safeError(error, 'invalid-settings');
      return json({ error: failure }, failure.code === 'invalid-settings' ? 400 : 503);
    }
  };
  for (const route of [
    { path: '/api/llm-quota/snapshot', methods: ['GET'], requestBody: 'buffered', fetch: handle(() => backend.snapshot()) },
    { path: '/api/llm-quota/refresh', methods: ['POST'], requestBody: 'buffered', fetch: handle(() => backend.refresh()) },
    { path: '/api/llm-quota/settings', methods: ['POST'], requestBody: 'buffered', fetch: handle(async request => backend.updateSettings(await bodyPatch(request))) },
  ]) ctx.effect(() => ctx.connection.fetch.register(route));

  ctx.effect(() => ctx.tools.register({
    name: 'quota_status',
    description: 'Read configured Models quota windows and API balances, refresh their read-only provider endpoints, or persist quota display settings. Uses only credentials saved in Models; unsupported endpoints and expired sign-ins are reported explicitly.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['action'],
      properties: {
        action: { type: 'string', enum: ['read', 'refresh', 'settings'], description: 'read uses the cache; refresh rechecks with a 10-second cooldown; settings saves patch without probing providers.' },
        patch: { ...SETTINGS_SCHEMA, description: 'Display settings to change; only for action settings.' },
      },
    },
    timeoutMs: 15000,
    isConcurrencySafe: args => args?.action !== 'settings',
    output: {
      schema: { oneOf: [SNAPSHOT_SCHEMA, ERROR_SCHEMA] },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      try {
        if (!args || !['read', 'refresh', 'settings'].includes(args.action) || Object.keys(args).some(key => !['action', 'patch'].includes(key)) || (args.action !== 'settings' && args.patch !== undefined)) throw new QuotaError('invalid-settings');
        if (args.action === 'settings') return await backend.updateSettings(args.patch);
        return await (args.action === 'refresh' ? backend.refresh() : backend.snapshot());
      } catch (error) { return { error: safeError(error, 'invalid-settings') }; }
    },
  }));
}
