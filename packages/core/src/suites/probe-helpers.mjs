export function weatherToolOpenAI() {
  return {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city.',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string', description: 'City name' } },
        required: ['city'],
      },
    },
  };
}

export function weatherToolClaude() {
  return {
    name: 'get_weather',
    description: 'Get current weather for a city.',
    input_schema: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  };
}

export function buildProbeResult({ id, endpoint, method, response, extra }) {
  const pass = Boolean(extra.pass);
  const resolvedModel = extra.model ?? null;
  return Object.freeze({
    id,
    endpoint,
    method,
    status: pass ? 'pass' : 'fail',
    httpStatus: response.status,
    latencyMs: response.latencyMs,
    model: extra.model ?? null,
    resolvedModel: resolvedModel !== extra.model ? resolvedModel : undefined,
    metrics: extra.metrics ?? Object.freeze({}),
    usage: extra.usage ?? null,
    signals: extra.signals ?? Object.freeze({}),
    headers: extra.headers ?? Object.freeze({}),
    expectedBoundary: extra.expectedBoundary ?? false,
    error: pass ? undefined : response.errorText || extra.failureReason || 'probe failed',
  });
}

export function skipProbeResult(id, protocol, label, reason) {
  return Object.freeze({
    id,
    protocol,
    label,
    status: 'skip',
    endpoint: null,
    method: null,
    httpStatus: 0,
    latencyMs: 0,
    model: null,
    metrics: Object.freeze({}),
    usage: null,
    signals: Object.freeze({ reason }),
    headers: Object.freeze({}),
    error: reason,
  });
}
