export function createAgentFacts(report, options = {}) {
  const suite = report?.suite ?? report?.run?.suite ?? 'unknown';
  const gateway = report?.gateway ?? report?.discovery?.gateway ?? {};
  const discovery = report?.discovery ?? (suite === 'discovery' ? report : null);
  const matrix = report?.matrix ?? (hasResults(report) ? report : null);
  const cache = suite === 'prompt-cache' ? report : null;
  const probes = collectProbes(report);
  const authStatus = summarizeAuth(discovery, probes);
  const networkStatus = summarizeNetwork(probes);
  const matrixFacts = summarizeMatrix(matrix);
  const latency = summarizeLatency(probes);
  const tokenUsage = summarizeUsage(probes);
  const routing = summarizeRouting(probes);
  const cacheFacts = summarizeCache(cache, probes);
  const fatal = isFatal({ authStatus, networkStatus, matrixFacts, probes });
  const status = fatal ? 'fatal' : matrixFacts.fail_count > 0 ? 'degraded' : 'pass';

  return deepFreeze({
    schemaVersion: '0.1',
    producedBy: 'gatewaycheck',
    mode: options.mode ?? 'agent',
    suite,
    status,
    ok: !fatal,
    exitCode: fatal ? 1 : 0,
    generatedAt: report?.generatedAt ?? report?.run?.finishedAt ?? new Date().toISOString(),
    gateway: {
      name: gateway.name ?? 'Unnamed Gateway',
      baseUrl: gateway.baseUrl ?? null,
      family: gateway.family ?? discovery?.gateway?.family ?? 'unknown',
    },
    facts: {
      requestCount: requestCount(report),
      auth_status: authStatus,
      network_status: networkStatus,
      discovery: summarizeDiscovery(discovery),
      budget: summarizeBudget(report),
      matrix: matrixFacts,
      latency,
      token_usage: tokenUsage,
      cache: cacheFacts,
      routing,
      probes,
    },
  });
}

export function createAgentError(error, options = {}) {
  return deepFreeze({
    schemaVersion: '0.1',
    producedBy: 'gatewaycheck',
    mode: options.mode ?? 'agent',
    suite: 'error',
    status: 'fatal',
    ok: false,
    exitCode: 1,
    generatedAt: new Date().toISOString(),
    gateway: {
      name: options.gateway?.name ?? 'unknown',
      baseUrl: options.gateway?.baseUrl ?? null,
      family: options.gateway?.family ?? 'unknown',
    },
    facts: {
      error: {
        type: error?.name ?? 'Error',
        message: String(error?.message ?? error ?? 'unknown error'),
      },
    },
  });
}

function collectProbes(report) {
  const output = [];
  if (Array.isArray(report?.probes)) {
    for (const probe of report.probes) output.push(normalizeProbe(probe));
  }
  if (Array.isArray(report?.results)) {
    for (const probe of report.results) output.push(normalizeProbe(probe));
  }
  if (Array.isArray(report?.discovery?.probes)) {
    for (const probe of report.discovery.probes) output.push(normalizeProbe(probe));
  }
  if (Array.isArray(report?.matrix?.results)) {
    for (const probe of report.matrix.results) output.push(normalizeProbe(probe));
  }
  return Object.freeze(output.filter(Boolean));
}

function normalizeProbe(probe) {
  if (!probe) return null;
  const requestedModel = probe.requestedModel ?? probe.model ?? null;
  const routingModel = probe.routing_model ?? probe.resolvedModel ?? probe.model ?? null;
  const usage = normalizeUsageShape(probe.usage);
  return {
    id: probe.id ?? null,
    protocol: probe.protocol ?? null,
    endpoint: probe.endpoint ?? null,
    method: probe.method ?? null,
    status: probe.status ?? 'unknown',
    http_status: numberOrNull(probe.httpStatus),
    latency_ms: numberOrNull(probe.latencyMs),
    token_latency_ms: numberOrNull(probe.latencyMs),
    requested_model: requestedModel,
    routing_model: routingModel,
    routing_changed: Boolean(requestedModel && routingModel && requestedModel !== routingModel),
    usage,
    cache_hit: usage.cached_tokens > 0,
    cache_hit_rate_pct: usage.cache_hit_rate_pct,
    signals: probe.signals ?? {},
    error: probe.error ?? null,
  };
}

function summarizeAuth(discovery, probes) {
  const modelProbe = discovery?.probes?.find((probe) => probe.id === 'models' || probe.endpoint === '/v1/models');
  const authProbes = probes.filter((probe) => [401, 403].includes(probe.http_status));
  const candidate = modelProbe ? normalizeProbe(modelProbe) : authProbes[0];
  if (!candidate) {
    return {
      checked: false,
      ok: null,
      http_status: null,
      endpoint: null,
      error: null,
    };
  }
  return {
    checked: true,
    ok: ![401, 403].includes(candidate.http_status) && candidate.status !== 'fail',
    http_status: candidate.http_status,
    endpoint: candidate.endpoint,
    error: candidate.error,
  };
}

function summarizeNetwork(probes) {
  const checked = probes.length > 0;
  const statusZero = probes.filter((probe) => probe.http_status === 0);
  const timeouts = statusZero.filter((probe) => /timeout/i.test(String(probe.error ?? '')));
  return {
    checked,
    ok: checked ? statusZero.length === 0 : null,
    status_zero_count: statusZero.length,
    timeout_count: timeouts.length,
    failed_probe_count: probes.filter((probe) => probe.status === 'fail').length,
  };
}

function summarizeDiscovery(discovery) {
  if (!discovery) {
    return {
      family: 'unknown',
      visible_model_count: null,
      pricing_model_count: null,
      model_sample: [],
      pricing_groups: [],
      pricing_vendors: [],
    };
  }
  return {
    family: discovery.gateway?.family ?? 'unknown',
    visible_model_count: discovery.modelSummary?.count ?? null,
    pricing_model_count: discovery.pricingSummary?.modelCount ?? null,
    model_sample: discovery.modelSummary?.sample ?? [],
    pricing_groups: discovery.pricingSummary?.groups ?? [],
    pricing_vendors: discovery.pricingSummary?.vendors ?? [],
  };
}

function summarizeBudget(report) {
  return {
    max_models: report?.budget?.maxModels ?? null,
    max_requests: report?.budget?.maxRequests ?? report?.matrix?.run?.requestBudget?.maxRequests ?? null,
    max_output_tokens: report?.budget?.maxOutputTokens ?? report?.matrix?.run?.maxOutputTokens ?? report?.run?.maxOutputTokens ?? null,
    planned_matrix_requests: report?.budget?.plannedMatrixRequests ?? planRequestCount(report?.auditPlan) ?? null,
    used_requests: requestCount(report),
  };
}

function summarizeMatrix(matrix) {
  const results = Array.isArray(matrix?.results) ? matrix.results : [];
  const summary = matrix?.summary ?? {};
  return {
    pass_count: summary.passCount ?? results.filter((probe) => probe.status === 'pass').length,
    fail_count: summary.failCount ?? results.filter((probe) => probe.status === 'fail').length,
    skip_count: summary.skippedCount ?? results.filter((probe) => probe.status === 'skip').length,
    protocols: summary.protocols ?? unique(results.map((probe) => probe.protocol).filter(Boolean)),
    models: summary.models ?? unique(results.map((probe) => probe.model).filter(Boolean)),
    by_protocol: summary.byProtocol ?? {},
    by_model: summary.byModel ?? {},
  };
}

function summarizeLatency(probes) {
  const values = probes.map((probe) => probe.latency_ms).filter((value) => Number.isFinite(value) && value > 0);
  return {
    avg_ms: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
    p95_ms: percentile(values, 0.95),
    max_ms: values.length ? Math.max(...values) : 0,
    by_protocol: latencyBy(probes, 'protocol'),
    by_endpoint: latencyBy(probes, 'endpoint'),
  };
}

function summarizeUsage(probes) {
  const totals = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, reasoning_tokens: 0 };
  for (const probe of probes) {
    totals.prompt_tokens += probe.usage.prompt_tokens;
    totals.completion_tokens += probe.usage.completion_tokens;
    totals.cached_tokens += probe.usage.cached_tokens;
    totals.reasoning_tokens += probe.usage.reasoning_tokens;
  }
  return {
    ...totals,
    cache_hit: totals.cached_tokens > 0,
    cache_hit_rate_pct: totals.prompt_tokens > 0 ? round((totals.cached_tokens / totals.prompt_tokens) * 100) : 0,
  };
}

function summarizeCache(cache, probes) {
  const summary = cache?.summary ?? {};
  const cacheRates = probes.map((probe) => probe.cache_hit_rate_pct).filter((value) => Number.isFinite(value) && value > 0);
  const secondRate = numberOrNull(summary.secondCacheHitRatePct);
  const rate = secondRate ?? (cacheRates.length ? Math.max(...cacheRates) : 0);
  return {
    checked: Boolean(cache) || cacheRates.length > 0,
    cache_hit: rate > 0,
    second_cache_hit_rate_pct: secondRate,
    max_observed_cache_hit_rate_pct: rate,
    second_cached_tokens: numberOrNull(summary.secondCachedTokens),
  };
}

function summarizeRouting(probes) {
  const changes = probes
    .filter((probe) => probe.routing_changed)
    .map((probe) => ({
      protocol: probe.protocol,
      requested_model: probe.requested_model,
      routing_model: probe.routing_model,
      endpoint: probe.endpoint,
    }));
  return {
    changed: changes.length > 0,
    changes,
  };
}

function isFatal({ authStatus, networkStatus, matrixFacts, probes }) {
  if (authStatus.checked && authStatus.ok === false && [401, 403].includes(authStatus.http_status)) return true;
  if (networkStatus.checked && networkStatus.status_zero_count > 0 && matrixFacts.pass_count === 0) return true;
  if (probes.length > 0 && probes.every((probe) => [401, 403].includes(probe.http_status))) return true;
  return false;
}

function normalizeUsageShape(usage) {
  return {
    prompt_tokens: numberOrZero(usage?.promptTokens ?? usage?.prompt_tokens),
    completion_tokens: numberOrZero(usage?.completionTokens ?? usage?.completion_tokens),
    cached_tokens: numberOrZero(usage?.cachedTokens ?? usage?.cached_tokens),
    reasoning_tokens: numberOrZero(usage?.reasoningTokens ?? usage?.reasoning_tokens),
    total_tokens: numberOrZero(usage?.totalTokens ?? usage?.total_tokens),
    cache_hit_rate_pct: numberOrZero(usage?.cacheHitRatePct ?? usage?.cache_hit_rate_pct),
  };
}

function hasResults(report) {
  return Array.isArray(report?.results);
}

function requestCount(report) {
  return report?.requestCount ?? report?.run?.requestCount ?? (
    (report?.discovery?.requestCount ?? 0) + (report?.matrix?.run?.requestCount ?? 0)
  );
}

function planRequestCount(plan) {
  if (!Array.isArray(plan)) return null;
  return plan.reduce((sum, item) => sum + (Array.isArray(item.protocols) ? item.protocols.length : 0), 0);
}

function latencyBy(probes, key) {
  const groups = {};
  for (const probe of probes) {
    const group = probe[key];
    if (!group || !Number.isFinite(probe.latency_ms) || probe.latency_ms <= 0) continue;
    groups[group] ??= [];
    groups[group].push(probe.latency_ms);
  }
  const output = {};
  for (const [group, values] of Object.entries(groups)) {
    output[group] = {
      avg_ms: round(values.reduce((sum, value) => sum + value, 0) / values.length),
      max_ms: Math.max(...values),
      count: values.length,
    };
  }
  return output;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[idx];
}

function unique(values) {
  return [...new Set(values)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
