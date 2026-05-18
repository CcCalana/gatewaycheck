import { createBenchmarkReport, summarizeResponseHeaders } from '../runtime/report.mjs';
import { requestJson } from '../runtime/http-client.mjs';
import { requestSseJson } from '../runtime/stream-client.mjs';
import {
  normalizeClaudeUsage,
  normalizeGeminiUsage,
  normalizeOpenAIUsage,
  normalizeResponsesUsage,
} from '../runtime/usage.mjs';

const DEFAULT_PROTOCOLS = Object.freeze(['openai-chat']);
const PROTOCOLS = Object.freeze({
  openaiChat: 'openai-chat',
  openaiResponses: 'openai-responses',
  openaiTools: 'openai-tools',
  openaiStream: 'openai-stream',
  anthropicMessages: 'anthropic-messages',
  geminiGenerate: 'gemini-generate',
});

export async function runMatrixSuite(config, apiKey) {
  const startedAt = new Date();
  const timeoutMs = config.requestBudget?.timeoutMs ?? 90000;
  const maxTokens = Math.min(config.requestBudget?.maxOutputTokens ?? 8, 128);
  const maxRequests = config.requestBudget?.maxRequests ?? 8;
  const plan = resolveMatrixPlan(config);
  const results = [];
  let requestCount = 0;

  for (const item of plan) {
    if (requestCount >= maxRequests) {
      results.push(skipResult(item, 'request budget exhausted'));
      continue;
    }
    results.push(await runMatrixProbe({ config, apiKey, item, maxTokens, timeoutMs }));
    requestCount += 1;
  }

  const finishedAt = new Date();
  return createBenchmarkReport({
    suite: 'matrix',
    config,
    startedAt,
    finishedAt,
    requestCount,
    maxOutputTokens: maxTokens,
    results,
    summary: summarizeMatrixResults(results),
  });
}

export function resolveMatrixPlan(config) {
  const matrix = config.matrix ?? {};
  const defaultProtocols = normalizeProtocols(matrix.protocols ?? DEFAULT_PROTOCOLS);
  const entries = Array.isArray(matrix.models) && matrix.models.length > 0
    ? matrix.models
    : inferMatrixModels(config, defaultProtocols);

  const plan = [];
  for (const entry of entries) {
    const model = typeof entry === 'string' ? entry : entry.id ?? entry.model;
    if (!model) continue;
    const protocols = normalizeProtocols(
      typeof entry === 'string' ? defaultProtocols : entry.protocols ?? defaultProtocols
    );
    for (const protocol of protocols) {
      plan.push(Object.freeze({
        model,
        label: typeof entry === 'string' ? model : entry.label ?? model,
        protocol,
      }));
    }
  }
  return Object.freeze(plan);
}

export function summarizeMatrixResults(results) {
  const byProtocol = {};
  const byModel = {};
  const protocols = new Set();
  const models = new Set();
  let skippedCount = 0;

  for (const result of results) {
    protocols.add(result.protocol);
    models.add(result.model);
    if (result.status === 'skip') skippedCount += 1;
    tally(byProtocol, result.protocol, result);
    tally(byModel, result.model, result);
  }

  return Object.freeze({
    modelCount: models.size,
    protocolCount: protocols.size,
    skippedCount,
    models: Object.freeze([...models]),
    protocols: Object.freeze([...protocols]),
    byProtocol: freezeTallies(byProtocol),
    byModel: freezeTallies(byModel),
  });
}

async function runMatrixProbe({ config, apiKey, item, maxTokens, timeoutMs }) {
  if (item.protocol === PROTOCOLS.openaiChat) {
    return probeOpenAIChat(config, apiKey, item, maxTokens, timeoutMs);
  }
  if (item.protocol === PROTOCOLS.openaiResponses) {
    return probeOpenAIResponses(config, apiKey, item, maxTokens, timeoutMs);
  }
  if (item.protocol === PROTOCOLS.openaiTools) {
    return probeOpenAITools(config, apiKey, item, maxTokens, timeoutMs);
  }
  if (item.protocol === PROTOCOLS.openaiStream) {
    return probeOpenAIStream(config, apiKey, item, maxTokens, timeoutMs);
  }
  if (item.protocol === PROTOCOLS.anthropicMessages) {
    return probeAnthropicMessages(config, apiKey, item, maxTokens, timeoutMs);
  }
  if (item.protocol === PROTOCOLS.geminiGenerate) {
    return probeGeminiGenerate(config, apiKey, item, maxTokens, timeoutMs);
  }
  return skipResult(item, `unknown protocol: ${item.protocol}`);
}

async function probeOpenAIChat(config, apiKey, item, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model: item.model,
      messages: [
        { role: 'system', content: 'Answer with the shortest possible response.' },
        { role: 'user', content: 'Reply exactly OK.' },
      ],
      max_tokens: maxTokens,
      temperature: 0,
      stream: false,
    },
  });
  const usage = normalizeOpenAIUsage(res.data?.usage);
  const content = res.data?.choices?.[0]?.message?.content;
  const finishReason = res.data?.choices?.[0]?.finish_reason;
  const visibleContentReturned = typeof content === 'string' && content.length > 0;
  return result(item, '/v1/chat/completions', 'POST', res, {
    usage,
    signals: {
      object: res.data?.object,
      finishReason,
      content,
      visibleContentReturned,
    },
    pass: res.ok && res.data?.object === 'chat.completion' && visibleContentReturned && finishReason !== 'length',
    failureReason: chatFailureReason({ response: res, content, finishReason }),
    model: res.data?.model ?? item.model,
  });
}

async function probeOpenAIResponses(config, apiKey, item, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/responses',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model: item.model,
      input: 'Reply exactly OK.',
      max_output_tokens: maxTokens,
      temperature: 0,
      store: false,
    },
  });
  const usage = normalizeResponsesUsage(res.data?.usage);
  const content = extractResponsesText(res.data);
  const status = res.data?.status;
  const visibleContentReturned = typeof content === 'string' && content.length > 0;
  return result(item, '/v1/responses', 'POST', res, {
    usage,
    signals: {
      object: res.data?.object,
      status,
      outputTypes: extractResponsesOutputTypes(res.data),
      content,
      visibleContentReturned,
    },
    pass: res.ok && res.data?.object === 'response' && visibleContentReturned && !['failed', 'incomplete'].includes(status),
    failureReason: responsesFailureReason({ response: res, content, status }),
    model: res.data?.model ?? item.model,
  });
}

async function probeOpenAITools(config, apiKey, item, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model: item.model,
      messages: [{ role: 'user', content: 'Use the tool to get weather for Paris.' }],
      tools: [weatherToolOpenAI()],
      tool_choice: { type: 'function', function: { name: 'get_weather' } },
      max_tokens: Math.min(maxTokens, 32),
      temperature: 0,
      stream: false,
    },
  });
  const call = res.data?.choices?.[0]?.message?.tool_calls?.[0];
  const parsedArguments = parseToolArguments(call?.function?.arguments);
  const usage = normalizeOpenAIUsage(res.data?.usage);
  return result(item, '/v1/chat/completions', 'POST', res, {
    usage,
    signals: {
      finishReason: res.data?.choices?.[0]?.finish_reason,
      toolName: call?.function?.name,
      arguments: call?.function?.arguments,
      argumentsJsonValid: parsedArguments.ok,
    },
    pass: res.ok && call?.function?.name === 'get_weather' && parsedArguments.ok,
    failureReason: parsedArguments.ok ? '' : 'tool arguments were not valid JSON',
    model: res.data?.model ?? item.model,
  });
}

async function probeOpenAIStream(config, apiKey, item, maxTokens, timeoutMs) {
  const res = await requestSseJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model: item.model,
      messages: [
        { role: 'system', content: 'Answer with the shortest possible response.' },
        { role: 'user', content: 'Reply exactly OK.' },
      ],
      max_tokens: maxTokens,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
    },
  });
  const usage = normalizeOpenAIUsage(res.usage);
  return result(item, '/v1/chat/completions', 'POST', res, {
    usage,
    metrics: res.metrics,
    signals: {
      sseDone: res.signals.doneSeen,
      finishReasons: res.signals.finishReasons,
      objectTypes: res.signals.objectTypes,
      jsonErrorCount: res.signals.jsonErrorCount,
      streamUsageReturned: Boolean(res.usage),
      visibleContentReturned: res.metrics.outputCharCount > 0,
    },
    pass: res.ok &&
      res.signals.doneSeen &&
      res.signals.jsonErrorCount === 0 &&
      res.metrics.outputCharCount > 0 &&
      !res.signals.finishReasons.includes('length'),
    failureReason: streamFailureReason(res),
    model: res.model ?? item.model,
  });
}

async function probeAnthropicMessages(config, apiKey, item, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/messages',
    method: 'POST',
    apiKey,
    timeoutMs,
    headers: { 'anthropic-version': '2023-06-01' },
    body: {
      model: item.model,
      max_tokens: Math.min(maxTokens, 8),
      messages: [{ role: 'user', content: 'Reply exactly OK.' }],
    },
  });
  const usage = normalizeClaudeUsage(res.data?.usage);
  return result(item, '/v1/messages', 'POST', res, {
    usage,
    signals: {
      type: res.data?.type,
      stopReason: res.data?.stop_reason,
      contentTypes: Array.isArray(res.data?.content) ? res.data.content.map((c) => c.type) : [],
    },
    pass: res.ok && res.data?.type === 'message',
    model: res.data?.model ?? item.model,
  });
}

async function probeGeminiGenerate(config, apiKey, item, maxTokens, timeoutMs) {
  const path = `/v1beta/models/${encodeURIComponent(item.model)}:generateContent`;
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path,
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      contents: [{ role: 'user', parts: [{ text: 'Reply exactly OK.' }] }],
      generationConfig: {
        maxOutputTokens: Math.min(maxTokens, 8),
        temperature: 0,
      },
    },
  });
  const usage = normalizeGeminiUsage(res.data?.usageMetadata);
  return result(item, path, 'POST', res, {
    usage,
    signals: {
      candidateCount: Array.isArray(res.data?.candidates) ? res.data.candidates.length : 0,
      finishReason: res.data?.candidates?.[0]?.finishReason,
    },
    pass: res.ok && Array.isArray(res.data?.candidates),
    model: item.model,
  });
}

function result(item, endpoint, method, response, extra) {
  const pass = Boolean(extra.pass);
  const resolvedModel = extra.model ?? item.model;
  return Object.freeze({
    id: `${item.protocol}:${item.model}`,
    protocol: item.protocol,
    label: item.label,
    status: pass ? 'pass' : 'fail',
    endpoint,
    method,
    httpStatus: response.status,
    latencyMs: response.latencyMs,
    model: item.model,
    resolvedModel: resolvedModel !== item.model ? resolvedModel : undefined,
    metrics: extra.metrics ?? {},
    usage: extra.usage,
    signals: extra.signals ?? {},
    headers: summarizeResponseHeaders(response.headers),
    error: pass ? undefined : response.errorText || extra.failureReason || 'probe failed',
  });
}

function skipResult(item, reason) {
  return Object.freeze({
    id: `${item.protocol}:${item.model}`,
    protocol: item.protocol,
    label: item.label,
    status: 'skip',
    endpoint: null,
    method: null,
    httpStatus: 0,
    latencyMs: 0,
    model: item.model,
    metrics: Object.freeze({}),
    usage: null,
    signals: Object.freeze({ reason }),
    headers: Object.freeze({}),
    error: reason,
  });
}

function inferMatrixModels(config, defaultProtocols) {
  const models = config.models ?? {};
  const entries = [];
  const openaiModel = models.openai ?? models.cheap;
  if (openaiModel) entries.push({ id: openaiModel, protocols: defaultProtocols });
  if (models.claude) entries.push({ id: models.claude, protocols: [PROTOCOLS.anthropicMessages] });
  if (models.gemini) entries.push({ id: models.gemini, protocols: [PROTOCOLS.geminiGenerate] });
  return entries.length ? entries : [{ id: 'gpt-5.4-mini', protocols: defaultProtocols }];
}

function normalizeProtocols(protocols) {
  const values = Array.isArray(protocols) ? protocols : [protocols];
  return Object.freeze(values.map((protocol) => String(protocol)).filter(Boolean));
}

function tally(target, key, result) {
  target[key] ??= { pass: 0, fail: 0, skip: 0, latencyMsTotal: 0, latencyCount: 0 };
  if (result.status === 'pass') target[key].pass += 1;
  if (result.status === 'fail') target[key].fail += 1;
  if (result.status === 'skip') target[key].skip += 1;
  if (result.latencyMs > 0) {
    target[key].latencyMsTotal += result.latencyMs;
    target[key].latencyCount += 1;
  }
}

function freezeTallies(tallies) {
  const output = {};
  for (const [key, value] of Object.entries(tallies)) {
    output[key] = Object.freeze({
      pass: value.pass,
      fail: value.fail,
      skip: value.skip,
      avgLatencyMs: value.latencyCount
        ? Math.round((value.latencyMsTotal / value.latencyCount) * 100) / 100
        : 0,
    });
  }
  return Object.freeze(output);
}

function weatherToolOpenAI() {
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

function chatFailureReason({ response, content, finishReason }) {
  if (!response.ok) return '';
  if (finishReason === 'length') return 'chat completion stopped because max tokens were exhausted';
  if (typeof content !== 'string' || content.length === 0) return 'chat completion returned no visible content';
  return 'probe failed';
}

function responsesFailureReason({ response, content, status }) {
  if (!response.ok) return '';
  if (status === 'failed') return 'response status was failed';
  if (status === 'incomplete') return 'response status was incomplete';
  if (typeof content !== 'string' || content.length === 0) return 'responses endpoint returned no visible content';
  return 'probe failed';
}

function streamFailureReason(response) {
  if (!response.ok) return '';
  if (!response.signals.doneSeen) return 'stream ended without [DONE]';
  if (response.signals.jsonErrorCount > 0) return 'stream contained invalid JSON event data';
  if (response.metrics.outputCharCount <= 0) return 'stream returned no visible content';
  if (response.signals.finishReasons.includes('length')) return 'stream stopped because max tokens were exhausted';
  return 'probe failed';
}

function parseToolArguments(value) {
  if (typeof value !== 'string') return Object.freeze({ ok: false });
  try {
    return Object.freeze({ ok: true, value: JSON.parse(value) });
  } catch {
    return Object.freeze({ ok: false });
  }
}

function extractResponsesText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (!Array.isArray(data?.output)) return '';
  const chunks = [];
  for (const item of data.output) {
    if (typeof item?.content === 'string') chunks.push(item.content);
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('');
}

function extractResponsesOutputTypes(data) {
  if (!Array.isArray(data?.output)) return [];
  return data.output.map((item) => item?.type).filter(Boolean);
}
