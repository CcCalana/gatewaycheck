import { createBenchmarkReport, summarizeResponseHeaders } from '../runtime/report.mjs';
import { requestSseJson } from '../runtime/stream-client.mjs';
import { normalizeOpenAIUsage } from '../runtime/usage.mjs';

export async function runStreamSuite(config, apiKey) {
  const startedAt = new Date();
  const timeoutMs = config.requestBudget?.timeoutMs ?? 90000;
  const maxTokens = Math.min(config.requestBudget?.maxOutputTokens ?? 16, 32);
  const maxRequests = config.requestBudget?.maxRequests ?? 8;
  const model = config.models?.openai ?? config.models?.cheap ?? 'gpt-5.4-mini';

  const { probe, requestCount } = await probeOpenAIChatStream({
    config,
    apiKey,
    model,
    maxTokens,
    timeoutMs,
    allowRetryWithoutStreamOptions: maxRequests >= 2,
  });
  const finishedAt = new Date();

  return createBenchmarkReport({
    suite: 'stream',
    config,
    startedAt,
    finishedAt,
    requestCount,
    maxOutputTokens: maxTokens,
    results: [probe],
    summary: summarizeStream([probe]),
  });
}

async function probeOpenAIChatStream({
  config,
  apiKey,
  model,
  maxTokens,
  timeoutMs,
  allowRetryWithoutStreamOptions,
}) {
  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: 'Answer with the shortest possible response. Do not explain your reasoning.',
      },
      {
        role: 'user',
        content: 'Reply exactly OK.',
      },
    ],
    max_tokens: maxTokens,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  };

  let requestCount = 1;
  let retriedWithoutStreamOptions = false;
  let response = await streamRequest(config, apiKey, timeoutMs, body);

  if (allowRetryWithoutStreamOptions && shouldRetryWithoutStreamOptions(response)) {
    const fallbackBody = { ...body };
    delete fallbackBody.stream_options;
    requestCount += 1;
    retriedWithoutStreamOptions = true;
    response = await streamRequest(config, apiKey, timeoutMs, fallbackBody);
  }

  const probe = summarizeOpenAIChatStream({
    response,
    model,
    retriedWithoutStreamOptions,
  });

  return Object.freeze({ probe, requestCount });
}

async function streamRequest(config, apiKey, timeoutMs, body) {
  return requestSseJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body,
  });
}

function summarizeOpenAIChatStream({ response, model, retriedWithoutStreamOptions }) {
  const usage = normalizeOpenAIUsage(response.usage);
  const pass = response.ok &&
    response.signals.doneSeen &&
    response.signals.jsonErrorCount === 0 &&
    response.metrics.sseEventCount > 0;

  return Object.freeze({
    id: 'stream-chat-ttft',
    status: pass ? 'pass' : 'fail',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    httpStatus: response.status,
    latencyMs: response.latencyMs,
    model: response.model ?? model,
    metrics: response.metrics,
    usage,
    signals: Object.freeze({
      sseDone: response.signals.doneSeen,
      finishReasons: response.signals.finishReasons,
      objectTypes: response.signals.objectTypes,
      jsonErrorCount: response.signals.jsonErrorCount,
      streamUsageReturned: Boolean(response.usage),
      retriedWithoutStreamOptions,
    }),
    headers: summarizeResponseHeaders(response.headers),
    error: pass ? undefined : response.errorText || streamFailureReason(response),
  });
}

function shouldRetryWithoutStreamOptions(response) {
  if (response.ok || response.status !== 400) return false;
  return /stream_options|include_usage|unsupported|unknown parameter|unrecognized/i.test(response.errorText ?? '');
}

function summarizeStream(probes) {
  const probe = probes[0];
  return Object.freeze({
    streamIntegrity: probe?.status === 'pass' ? 'pass' : 'fail',
    ttftMs: probe?.metrics?.ttftMs ?? 0,
    totalLatencyMs: probe?.metrics?.totalLatencyMs ?? 0,
    tokensPerSecond: probe?.metrics?.tokensPerSecond ?? 0,
    streamUsageReturned: probe?.signals?.streamUsageReturned === true,
  });
}

function streamFailureReason(response) {
  if (!response.ok) return `HTTP ${response.status}`;
  if (!response.signals.doneSeen) return 'stream ended without [DONE]';
  if (response.signals.jsonErrorCount > 0) return 'stream contained invalid JSON event data';
  if (response.metrics.sseEventCount === 0) return 'stream returned no SSE events';
  return 'stream probe failed';
}
