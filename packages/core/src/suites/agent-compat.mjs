import { requestJson } from '../runtime/http-client.mjs';
import { normalizeOpenAIUsage, normalizeResponsesUsage, normalizeClaudeUsage } from '../runtime/usage.mjs';

export async function runAgentCompatibilitySuite(config, apiKey) {
  const timeoutMs = config.requestBudget?.timeoutMs ?? 90000;
  const maxTokens = config.requestBudget?.maxOutputTokens ?? 64;
  const models = config.models ?? {};
  const openaiModel = models.openai ?? models.cheap ?? 'gpt-5.4-mini';
  const claudeModel = models.claude ?? 'claude-sonnet-4-5-20250929';

  const probes = [];
  probes.push(await probeOpenAIChat(config, apiKey, openaiModel, maxTokens, timeoutMs));
  probes.push(await probeOpenAITools(config, apiKey, openaiModel, maxTokens, timeoutMs));
  probes.push(await probeResponses(config, apiKey, openaiModel, maxTokens, timeoutMs));
  probes.push(await probeResponsesTools(config, apiKey, openaiModel, maxTokens, timeoutMs));
  probes.push(await probeClaudeMessages(config, apiKey, claudeModel, maxTokens, timeoutMs));
  probes.push(await probeClaudeToolUse(config, apiKey, claudeModel, maxTokens, timeoutMs));
  probes.push(await probeThreadsBoundary(config, apiKey, timeoutMs));

  return Object.freeze({
    schemaVersion: '0.1',
    suite: 'agent-compatibility',
    gateway: {
      name: config.name ?? 'Unnamed Gateway',
      baseUrl: config.baseUrl,
    },
    requestCount: probes.length,
    probes: Object.freeze(probes),
    summary: summarizeAgentCompatibility(probes),
    generatedAt: new Date().toISOString(),
  });
}

async function probeOpenAIChat(config, apiKey, model, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model,
      messages: [{ role: 'user', content: 'Reply exactly OK.' }],
      max_tokens: Math.min(maxTokens, 8),
      stream: false,
    },
  });
  const usage = normalizeOpenAIUsage(res.data?.usage);
  return result('openai-chat', '/v1/chat/completions', res, {
    model: res.data?.model ?? model,
    usage,
    signals: { object: res.data?.object, content: res.data?.choices?.[0]?.message?.content },
    pass: res.ok && res.data?.object === 'chat.completion',
  });
}

async function probeOpenAITools(config, apiKey, model, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model,
      messages: [{ role: 'user', content: 'Use the tool to get weather for Paris.' }],
      tools: [weatherToolOpenAI()],
      tool_choice: { type: 'function', function: { name: 'get_weather' } },
      max_tokens: maxTokens,
      temperature: 0,
      stream: false,
    },
  });
  const message = res.data?.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  const usage = normalizeOpenAIUsage(res.data?.usage);
  return result('openai-tools', '/v1/chat/completions', res, {
    model: res.data?.model ?? model,
    usage,
    signals: {
      finishReason: res.data?.choices?.[0]?.finish_reason,
      toolName: call?.function?.name,
      arguments: call?.function?.arguments,
    },
    pass: res.ok && call?.function?.name === 'get_weather',
  });
}

async function probeResponses(config, apiKey, model, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/responses',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model,
      input: 'Reply exactly OK.',
      max_output_tokens: Math.max(16, Math.min(maxTokens, 32)),
      stream: false,
    },
  });
  const usage = normalizeResponsesUsage(res.data?.usage);
  return result('responses-basic', '/v1/responses', res, {
    model: res.data?.model ?? model,
    usage,
    signals: {
      object: res.data?.object,
      status: res.data?.status,
      outputTypes: Array.isArray(res.data?.output) ? res.data.output.map((o) => o.type) : [],
    },
    pass: res.ok && res.data?.object === 'response',
  });
}

async function probeResponsesTools(config, apiKey, model, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/responses',
    method: 'POST',
    apiKey,
    timeoutMs,
    body: {
      model,
      input: 'Use the tool to get weather for Paris.',
      tools: [{
        type: 'function',
        name: 'get_weather',
        description: 'Get current weather for a city.',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
        strict: true,
      }],
      tool_choice: { type: 'function', name: 'get_weather' },
      max_output_tokens: maxTokens,
      stream: false,
    },
  });
  const output = Array.isArray(res.data?.output) ? res.data.output.find((o) => o.type === 'function_call') : null;
  const usage = normalizeResponsesUsage(res.data?.usage);
  return result('responses-tools', '/v1/responses', res, {
    model: res.data?.model ?? model,
    usage,
    signals: {
      outputType: output?.type,
      toolName: output?.name,
      arguments: output?.arguments,
    },
    pass: res.ok && output?.type === 'function_call' && output?.name === 'get_weather',
  });
}

async function probeClaudeMessages(config, apiKey, model, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/messages',
    method: 'POST',
    apiKey,
    timeoutMs,
    headers: { 'anthropic-version': '2023-06-01' },
    body: {
      model,
      max_tokens: Math.min(maxTokens, 8),
      messages: [{ role: 'user', content: 'Reply exactly OK.' }],
    },
  });
  const usage = normalizeClaudeUsage(res.data?.usage);
  return result('claude-messages', '/v1/messages', res, {
    model: res.data?.model ?? model,
    usage,
    signals: {
      type: res.data?.type,
      stopReason: res.data?.stop_reason,
      contentTypes: Array.isArray(res.data?.content) ? res.data.content.map((c) => c.type) : [],
    },
    pass: res.ok && res.data?.type === 'message',
  });
}

async function probeClaudeToolUse(config, apiKey, model, maxTokens, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/messages',
    method: 'POST',
    apiKey,
    timeoutMs,
    headers: { 'anthropic-version': '2023-06-01' },
    body: {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: 'Use the tool to get weather for Paris.' }],
      tools: [{
        name: 'get_weather',
        description: 'Get current weather for a city.',
        input_schema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      }],
      tool_choice: { type: 'tool', name: 'get_weather' },
    },
  });
  const tool = Array.isArray(res.data?.content) ? res.data.content.find((c) => c.type === 'tool_use') : null;
  const usage = normalizeClaudeUsage(res.data?.usage);
  return result('claude-tool-use', '/v1/messages', res, {
    model: res.data?.model ?? model,
    usage,
    signals: {
      stopReason: res.data?.stop_reason,
      toolName: tool?.name,
      input: tool?.input,
    },
    pass: res.ok && res.data?.stop_reason === 'tool_use' && tool?.name === 'get_weather',
  });
}

async function probeThreadsBoundary(config, apiKey, timeoutMs) {
  const res = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/threads',
    method: 'POST',
    apiKey,
    timeoutMs,
    headers: { 'OpenAI-Beta': 'assistants=v2' },
    body: {},
  });
  return result('assistants-threads-boundary', '/v1/threads', res, {
    signals: { httpStatus: res.status },
    pass: res.ok,
    expectedBoundary: res.status === 404,
  });
}

function result(id, endpoint, response, extra) {
  const pass = Boolean(extra.pass);
  return Object.freeze({
    id,
    endpoint,
    status: pass ? 'pass' : 'fail',
    httpStatus: response.status,
    latencyMs: response.latencyMs,
    model: extra.model,
    usage: extra.usage,
    signals: extra.signals ?? {},
    expectedBoundary: extra.expectedBoundary ?? false,
    error: response.ok ? undefined : response.errorText,
  });
}

function summarizeAgentCompatibility(probes) {
  const passIds = new Set(probes.filter((p) => p.status === 'pass').map((p) => p.id));
  const boundary404 = probes.find((p) => p.id === 'assistants-threads-boundary')?.expectedBoundary === true;
  let classification = 'chat-only';
  if (passIds.has('openai-tools') && passIds.has('responses-tools') && passIds.has('claude-tool-use')) {
    classification = boundary404 ? 'agent-client-compatible' : 'agent-runtime-compatible';
  }
  return Object.freeze({
    classification,
    passCount: probes.filter((p) => p.status === 'pass').length,
    failCount: probes.filter((p) => p.status === 'fail').length,
    passed: Object.freeze([...passIds]),
  });
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
