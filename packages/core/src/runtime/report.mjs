import { sanitizeForLog } from './http-client.mjs';
import { deepFreeze } from './utils.mjs';

export function createBenchmarkReport({
  schemaVersion = '0.2',
  suite,
  config,
  startedAt,
  finishedAt = new Date(),
  requestCount,
  maxOutputTokens,
  results = [],
  summary = {},
}) {
  const started = toDate(startedAt);
  const finished = toDate(finishedAt);
  const baseSummary = summarizeResults(results);

  return deepFreeze({
    schemaVersion,
    gateway: {
      name: config.name ?? 'Unnamed Gateway',
      baseUrl: config.baseUrl,
      family: config.family ?? undefined,
    },
    run: {
      id: buildRunId(suite, started),
      suite,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: Math.max(0, finished.getTime() - started.getTime()),
      requestCount,
      maxOutputTokens,
    },
    results,
    summary: {
      ...baseSummary,
      ...summary,
    },
  });
}

export function summarizeResults(results = []) {
  const passCount = results.filter((result) => result.status === 'pass').length;
  const failCount = results.filter((result) => result.status === 'fail').length;
  return Object.freeze({
    passCount,
    failCount,
  });
}

export function summarizeResponseHeaders(headers = {}) {
  const normalized = normalizeHeaderMap(headers);
  const rateLimit = pickHeaders(normalized, [
    'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-reset-requests',
    'x-ratelimit-limit-tokens',
    'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-tokens',
  ]);

  return deepFreeze({
    requestId: firstHeader(normalized, [
      'x-request-id',
      'request-id',
      'x-openai-request-id',
      'x-anthropic-request-id',
      'cf-ray',
    ]),
    retryAfter: firstHeader(normalized, ['retry-after']),
    rateLimit,
    trace: {
      traceparent: Boolean(normalized.traceparent),
      tracestate: Boolean(normalized.tracestate),
    },
  });
}

function buildRunId(suite, startedAt) {
  const timestamp = startedAt.toISOString().replace(/\D/g, '').slice(0, 14);
  return `local-${suite}-${timestamp}`;
}

function firstHeader(headers, names) {
  for (const name of names) {
    if (headers[name]) return sanitizeForLog(headers[name], 160);
  }
  return null;
}

function pickHeaders(headers, names) {
  const picked = {};
  for (const name of names) {
    if (headers[name]) picked[name] = sanitizeForLog(headers[name], 80);
  }
  return picked;
}

function normalizeHeaderMap(headers) {
  const entries = headers instanceof Headers ? headers.entries() : Object.entries(headers ?? {});
  const normalized = {};
  for (const [key, value] of entries) {
    normalized[String(key).toLowerCase()] = String(value);
  }
  return normalized;
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (value) return new Date(value);
  return new Date();
}
