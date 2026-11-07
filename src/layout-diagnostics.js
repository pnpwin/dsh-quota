import { QuotaError } from './providers.js';

export const LAYOUT_VERSION = '1.1.0';
const number = { type: 'number' };
const integer = { type: 'integer' };
const payloadProperties = {
  version: { type: 'string', const: LAYOUT_VERSION },
  viewportWidth: number, barWidth: number, moreWidth: number,
  chipWidths: { type: 'array', items: number },
  visibleCount: integer, hiddenCount: integer,
  flexGrow: number, flexShrink: number,
  flexBasisPx: { oneOf: [number, { type: 'null' }] },
  supportsHas: { type: 'boolean' }, directDockChild: { type: 'boolean' },
};
const payloadKeys = Object.keys(payloadProperties);
export const LAYOUT_SAMPLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: [...payloadKeys, 'receivedAt'],
  properties: { ...payloadProperties, receivedAt: { type: 'string' } },
  description: 'Anonymous browser layout measurement, retained in memory only (last 8). Widths are finite 0–100000; at most 100 chip widths; visible and hidden counts sum to chip count. Flex factors are finite 0–10000. No names, identifiers, paths or credentials.',
};
const bounded = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
export function validateLayoutReport(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || ![Object.prototype, null].includes(Object.getPrototypeOf(payload))) throw new QuotaError('invalid-settings');
  const keys = Object.keys(payload);
  if (keys.length !== payloadKeys.length || keys.some(key => !payloadKeys.includes(key)) || payloadKeys.some(key => !Object.hasOwn(payload, key))) throw new QuotaError('invalid-settings');
  if (payload.version !== LAYOUT_VERSION || typeof payload.supportsHas !== 'boolean' || typeof payload.directDockChild !== 'boolean') throw new QuotaError('invalid-settings');
  if (['viewportWidth', 'barWidth', 'moreWidth'].some(key => !bounded(payload[key], 100000))) throw new QuotaError('invalid-settings');
  if (!Array.isArray(payload.chipWidths) || payload.chipWidths.length > 100 || Array.from(payload.chipWidths).some(width => !bounded(width, 100000))) throw new QuotaError('invalid-settings');
  if (['visibleCount', 'hiddenCount'].some(key => !Number.isInteger(payload[key]) || !bounded(payload[key], 100)) || payload.visibleCount + payload.hiddenCount !== payload.chipWidths.length) throw new QuotaError('invalid-settings');
  if (['flexGrow', 'flexShrink'].some(key => !bounded(payload[key], 10000)) || (payload.flexBasisPx !== null && !bounded(payload.flexBasisPx, 100000))) throw new QuotaError('invalid-settings');
  // Construct the only permitted output fields explicitly; never retain the request object.
  return {
    version: payload.version, viewportWidth: payload.viewportWidth, barWidth: payload.barWidth,
    moreWidth: payload.moreWidth, chipWidths: [...payload.chipWidths],
    visibleCount: payload.visibleCount, hiddenCount: payload.hiddenCount,
    flexGrow: payload.flexGrow, flexShrink: payload.flexShrink,
    flexBasisPx: payload.flexBasisPx, supportsHas: payload.supportsHas, directDockChild: payload.directDockChild,
  };
}

/** No services, persistence, provider discovery or network operations participate in this store. */
export function createLayoutDiagnostics({ now = Date.now } = {}) {
  let samples = [], disposed = false;
  return {
    accept(payload) {
      if (disposed) throw new QuotaError('cancelled');
      const sample = { ...validateLayoutReport(payload), receivedAt: new Date(now()).toISOString() };
      samples.push(sample);
      if (samples.length > 8) samples.splice(0, samples.length - 8);
      return { received: true };
    },
    read() { return samples.map(sample => ({ ...sample, chipWidths: [...sample.chipWidths] })); },
    dispose() { disposed = true; samples = []; },
  };
}
