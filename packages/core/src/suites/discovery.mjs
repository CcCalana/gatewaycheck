import { requestJson, sanitizeForLog } from '../runtime/http-client.mjs';
import { numberOrNull } from '../runtime/utils.mjs';

export async function discoverGateway(config, apiKey = '') {
  const timeoutMs = config.requestBudget?.timeoutMs ?? 30000;
  const status = await requestJson({ baseUrl: config.baseUrl, path: '/api/status', timeoutMs });
  const pricing = await requestJson({ baseUrl: config.baseUrl, path: '/api/pricing', timeoutMs });
  const models = apiKey
    ? await requestJson({ baseUrl: config.baseUrl, path: '/v1/models', apiKey, timeoutMs })
    : null;

  const family = inferFamily(status.data, pricing.data);
  return Object.freeze({
    schemaVersion: '0.1',
    suite: 'discovery',
    gateway: gatewayInfo(config, family),
    requestCount: apiKey ? 3 : 2,
    probes: Object.freeze([
      summarize('status', '/api/status', status),
      summarize('pricing', '/api/pricing', pricing),
      models ? summarize('models', '/v1/models', models) : null,
    ].filter(Boolean)),
    statusData: status.data?.data ?? status.data ?? null,
    pricingSummary: summarizePricing(pricing.data),
    modelSummary: summarizeModels(models?.data),
    pricingModels: summarizePricingModels(pricing.data),
    generatedAt: new Date().toISOString(),
  });
}

function inferFamily(statusData, pricingData) {
  const status = statusData?.data ?? statusData ?? {};
  if (String(status.docs_link ?? '').includes('docs.newapi.pro')) return 'new-api';
  if (pricingData?.supported_endpoint || pricingData?.data?.supported_endpoint) return 'new-api-like';
  if (status.server_address || status.system_name) return 'openai-compatible-dashboard';
  return 'unknown';
}

function gatewayInfo(config, family) {
  return Object.freeze({
    name: config.name ?? 'Unnamed Gateway',
    baseUrl: config.baseUrl,
    family,
  });
}

function summarize(id, endpoint, response) {
  return Object.freeze({
    id,
    endpoint,
    status: response.ok ? 'pass' : 'fail',
    httpStatus: response.status,
    latencyMs: response.latencyMs,
    error: response.errorText || undefined,
  });
}

function summarizePricing(data) {
  const root = data ?? {};
  const payload = root.data ?? root;
  const values = payloadValues(payload);
  const models = extractPricingModels(payload, values);
  const supportedEndpoint = root.supported_endpoint ??
    root.supportedEndpoint ??
    payload.supported_endpoint ??
    payload.supportedEndpoint ??
    findSupportedEndpoint(values) ??
    null;
  const usableGroup = root.usable_group ??
    root.usableGroup ??
    payload.usable_group ??
    payload.usableGroup ??
    findUsableGroup(values);
  const vendors = Array.isArray(root.vendors)
    ? root.vendors
    : Array.isArray(payload.vendors)
      ? payload.vendors
      : findVendors(values);

  return Object.freeze({
    modelCount: models.length,
    supportedEndpoint,
    groups: usableGroup ? Object.keys(usableGroup) : [],
    vendors: vendors.map((v) => v.name).filter(Boolean),
  });
}

function summarizeModels(data) {
  if (!data) return null;
  const models = Array.isArray(data.data) ? data.data : [];
  return Object.freeze({
    object: data.object ?? null,
    count: models.length,
    sample: models.slice(0, 20).map((m) => m.id ?? m.model_name ?? m),
  });
}

function summarizePricingModels(data) {
  const root = data ?? {};
  const payload = root.data ?? root;
  const values = payloadValues(payload);
  const models = extractPricingModels(payload, values);
  return Object.freeze(models.slice(0, 200).map((model) => Object.freeze({
    id: sanitizeForLog(model.model_name ?? model.model ?? model.id ?? '', 160),
    modelRatio: numberOrNull(model.model_ratio),
    modelPrice: numberOrNull(model.model_price),
    completionRatio: numberOrNull(model.completion_ratio),
    cacheRatio: numberOrNull(model.cache_ratio),
    groups: Object.freeze(Array.isArray(model.enable_groups) ? model.enable_groups.map(String) : []),
    endpoints: Object.freeze(Array.isArray(model.supported_endpoint_types) ? model.supported_endpoint_types.map(String) : []),
  })).filter((model) => model.id));
}

function payloadValues(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return Array.isArray(payload) ? payload : Object.values(payload);
}

function extractPricingModels(payload, values) {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload) && payload.every(isPricingModel)) return payload;
  return values.find((value) => Array.isArray(value) && value.some(isPricingModel)) ?? [];
}

function isPricingModel(value) {
  return Boolean(value && typeof value === 'object' && (value.model_name || value.model || value.id));
}

function findUsableGroup(values) {
  return values.find((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(([, v]) => typeof v === 'number');
  }) ?? null;
}

function findSupportedEndpoint(values) {
  return values.find((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value).some((endpoint) => endpoint?.path && endpoint?.method);
  }) ?? null;
}

function findVendors(values) {
  return values.find((value) => {
    if (!Array.isArray(value)) return false;
    return value.some((item) => item && typeof item === 'object' && item.name && item.icon);
  }) ?? [];
}
