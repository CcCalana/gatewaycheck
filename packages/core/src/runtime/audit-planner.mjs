const DEFAULT_AUDIT_MODELS = 4;

export function buildAuditMatrixConfig(config, discoveryReport, options = {}) {
  const maxModels = options.maxModels ?? config.audit?.maxModels ?? DEFAULT_AUDIT_MODELS;
  const availableModels = getAvailableModelIds(discoveryReport);
  const pricingModels = Array.isArray(discoveryReport?.pricingModels) ? discoveryReport.pricingModels : [];
  const configuredModels = configuredModelHints(config.models);
  const configModels = configuredModels.map((model) => model.id);
  const candidates = selectAuditModels({
    availableModels,
    pricingModels,
    configModels,
    configuredModels,
    maxModels,
  });
  const matrixModels = candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    protocols: candidate.protocols,
  }));

  return {
    config: {
      ...config,
      requestBudget: {
        ...(config.requestBudget ?? {}),
        maxRequests: options.maxRequests ?? config.audit?.maxRequests ?? config.requestBudget?.maxRequests ?? 8,
        maxOutputTokens: options.maxOutputTokens ?? config.audit?.maxOutputTokens ?? config.requestBudget?.maxOutputTokens ?? 32,
      },
      matrix: {
        models: matrixModels,
      },
    },
    plan: Object.freeze(candidates),
  };
}

export function selectAuditModels({
  availableModels = [],
  pricingModels = [],
  configModels = [],
  configuredModels = [],
  maxModels = DEFAULT_AUDIT_MODELS,
}) {
  const available = new Set(availableModels.map(String));
  const usableAvailable = availableModels.filter(isLikelyChatModel);
  const availableHints = usableAvailable.map((id) => modelHint(id));
  const configHints = normalizeConfiguredModels(configuredModels, configModels);
  const visiblePricing = pricingModels.filter((model) => (
    model?.id &&
    isLikelyChatModel(model.id) &&
    (!available.size || available.has(model.id))
  ));
  const configPricing = pricingModels.filter((model) => (
    model?.id &&
    isLikelyChatModel(model.id) &&
    configModels.includes(model.id)
  ));
  const broadPricing = pricingModels.filter((model) => model?.id && isLikelyChatModel(model.id));
  const source = visiblePricing.length
    ? visiblePricing
    : configPricing.length
      ? configPricing
      : broadPricing.length
        ? broadPricing
        : mergeModels(configHints, availableHints);
  const representativeSource = mergeModels(source, configPricing, broadPricing, configHints, availableHints);

  const selected = [];
  const openAIModel = cheapestOpenAI(source);
  addCandidate(
    selected,
    openAIModel,
    openAIProtocolsForModel(openAIModel),
    hasCostHint(openAIModel) ? 'Cheapest OpenAI-compatible model' : 'OpenAI-compatible candidate'
  );
  addCandidate(selected, cheapestByHint(representativeSource, /deepseek/i), ['openai-chat', 'openai-stream'], 'DeepSeek/reasoning representative');
  addCandidate(selected, cheapestByHint(representativeSource, /qwen|glm|kimi|minimax/i), ['openai-chat'], 'Alternative text model');
  addCandidate(selected, cheapestWithEndpoint(representativeSource, 'anthropic'), ['anthropic-messages'], 'Anthropic-compatible model');
  addCandidate(selected, cheapestWithEndpoint(representativeSource, 'gemini'), ['gemini-generate'], 'Gemini-native model');

  for (const model of sortByCost(source)) {
    if (selected.length >= maxModels) break;
    addCandidate(selected, model, protocolsForModel(model), 'Additional visible low-cost model');
  }

  return Object.freeze(selected.slice(0, maxModels));
}

function mergeModels(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const model of list) {
      if (!model?.id) continue;
      const existing = byId.get(model.id);
      if (!existing) {
        byId.set(model.id, model);
        continue;
      }
      byId.set(model.id, {
        ...existing,
        ...model,
        modelRatio: existing.modelRatio ?? model.modelRatio,
        modelPrice: existing.modelPrice ?? model.modelPrice,
        completionRatio: existing.completionRatio ?? model.completionRatio,
        endpoints: [...new Set([...(existing.endpoints ?? []), ...(model.endpoints ?? [])])],
        groups: [...new Set([...(existing.groups ?? []), ...(model.groups ?? [])])],
      });
    }
  }
  return [...byId.values()];
}

export function getAvailableModelIds(discoveryReport) {
  const sample = discoveryReport?.modelSummary?.sample;
  return Array.isArray(sample) ? sample.map(String).filter(Boolean) : [];
}

function addCandidate(selected, model, protocols, label) {
  if (!model?.id || selected.some((item) => item.id === model.id)) return;
  selected.push(Object.freeze({
    id: model.id,
    label,
    protocols: Object.freeze(protocols),
    costHint: costOf(model),
    groups: Object.freeze(model.groups ?? []),
    endpoints: Object.freeze(model.endpoints ?? []),
  }));
}

function cheapestOpenAI(models) {
  return cheapestWithEndpoint(models, 'openai') ?? sortByCost(models)[0];
}

function cheapestWithEndpoint(models, endpoint) {
  return sortByCost(models.filter((model) => hasEndpoint(model, endpoint)))[0] ?? null;
}

function cheapestByHint(models, pattern) {
  return sortByCost(models.filter((model) => pattern.test(model.id)))[0] ?? null;
}

function protocolsForModel(model) {
  if (hasEndpoint(model, 'openai-responses')) return ['openai-responses'];
  if (hasEndpoint(model, 'anthropic') && /claude/i.test(model.id)) return ['anthropic-messages'];
  if (hasEndpoint(model, 'gemini') && /gemini/i.test(model.id)) return ['gemini-generate'];
  return ['openai-chat'];
}

function openAIProtocolsForModel(model) {
  if (!model) return ['openai-chat'];
  const protocols = [];
  if (hasEndpoint(model, 'openai-responses')) protocols.push('openai-responses');
  protocols.push('openai-chat', 'openai-stream', 'openai-tools');
  return Object.freeze(protocols);
}

function configuredModelHints(models = {}) {
  return Object.entries(models)
    .map(([role, id]) => modelHint(id, role))
    .filter((model) => model.id && isLikelyChatModel(model.id));
}

function normalizeConfiguredModels(configuredModels, configModels) {
  if (Array.isArray(configuredModels) && configuredModels.length) {
    return configuredModels
      .map((model) => typeof model === 'string' ? modelHint(model) : modelHint(model.id, model.role, model.endpoints))
      .filter((model) => model.id && isLikelyChatModel(model.id));
  }
  return configModels.map((id) => modelHint(id)).filter((model) => model.id && isLikelyChatModel(model.id));
}

function modelHint(id, role = '', explicitEndpoints = null) {
  const modelId = String(id ?? '');
  return Object.freeze({
    id: modelId,
    endpoints: Object.freeze(explicitEndpoints ?? inferEndpoints(modelId, role)),
    groups: Object.freeze([]),
    modelRatio: null,
    modelPrice: null,
    completionRatio: null,
  });
}

function inferEndpoints(id, role = '') {
  const text = String(id ?? '');
  const normalizedRole = String(role ?? '').toLowerCase();
  const endpoints = new Set();
  if (normalizedRole === 'claude' || /claude/i.test(text)) endpoints.add('anthropic');
  if (normalizedRole === 'gemini' || /gemini/i.test(text)) endpoints.add('gemini');
  if (!endpoints.size || normalizedRole === 'openai' || normalizedRole === 'cheap') endpoints.add('openai');
  if ((normalizedRole === 'openai' || normalizedRole === 'cheap' || /gpt|codex|chatgpt|^o\d/i.test(text)) && endpoints.has('openai')) {
    endpoints.add('openai-responses');
  }
  return [...endpoints];
}

function isLikelyChatModel(id) {
  const text = String(id ?? '');
  if (!text) return false;
  return !/moderation|embedding|rerank|image|sora|audio|tts|whisper/i.test(text);
}

function hasEndpoint(model, endpoint) {
  return Array.isArray(model.endpoints) && model.endpoints.includes(endpoint);
}

function sortByCost(models) {
  return [...models].sort((a, b) => costOf(a) - costOf(b) || String(a.id).localeCompare(String(b.id)));
}

function costOf(model) {
  const ratio = numberOrInf(model.modelRatio);
  const price = numberOrInf(model.modelPrice);
  const completion = numberOrZero(model.completionRatio);
  return Math.min(ratio, price) + completion * 0.01;
}

function hasCostHint(model) {
  if (!model) return false;
  return Number.isFinite(numberOrInf(model.modelRatio)) || Number.isFinite(numberOrInf(model.modelPrice));
}

function numberOrInf(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
