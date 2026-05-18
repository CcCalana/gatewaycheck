import { performance } from 'node:perf_hooks';
import { buildUrl, sanitizeForLog } from './http-client.mjs';

export async function requestSseJson({
  baseUrl,
  path,
  method = 'POST',
  apiKey = '',
  headers = {},
  body,
  timeoutMs = 90000,
}) {
  const url = buildUrl(baseUrl, path);
  validateExternalHttps(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  const requestHeaders = {
    Accept: 'text/event-stream',
    ...headers,
  };
  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;
  if (body !== undefined && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      return streamFailure({
        response,
        startedAt,
        errorText: sanitizeForLog(text || response.statusText, 1000),
      });
    }

    return await readSseResponse(response, startedAt);
  } catch (error) {
    return Object.freeze({
      ok: false,
      status: 0,
      latencyMs: elapsedMs(startedAt),
      headers: Object.freeze({}),
      usage: null,
      model: null,
      metrics: Object.freeze({
        firstByteMs: 0,
        ttftMs: 0,
        totalLatencyMs: elapsedMs(startedAt),
        networkChunkCount: 0,
        networkBytes: 0,
        sseEventCount: 0,
        jsonEventCount: 0,
        chunkGapMsAvg: 0,
        chunkGapMsP95: 0,
        tokensPerSecond: 0,
        outputCharCount: 0,
      }),
      signals: Object.freeze({
        doneSeen: false,
        finishReasons: Object.freeze([]),
        objectTypes: Object.freeze([]),
        jsonErrorCount: 0,
      }),
      errorText: error.name === 'AbortError' ? 'request timeout' : sanitizeForLog(error.message),
    });
  } finally {
    clearTimeout(timer);
  }
}

export function parseSseDataBlock(block) {
  const dataLines = [];
  for (const line of String(block).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  return dataLines.length ? dataLines.join('\n') : null;
}

export function drainSseDataEvents(buffer) {
  const events = [];
  let rest = String(buffer);
  while (true) {
    const match = rest.match(/\r?\n\r?\n/);
    if (!match) break;
    const block = rest.slice(0, match.index);
    rest = rest.slice(match.index + match[0].length);
    const data = parseSseDataBlock(block);
    if (data !== null) events.push(data);
  }
  return Object.freeze({ events: Object.freeze(events), rest });
}

export function summarizeIntervals(times) {
  if (!Array.isArray(times) || times.length < 2) {
    return Object.freeze({ avg: 0, p95: 0, max: 0 });
  }
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) {
    gaps.push(Math.max(0, times[i] - times[i - 1]));
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  return Object.freeze({
    avg: roundMs(avg),
    p95: roundMs(sorted[p95Index]),
    max: roundMs(sorted[sorted.length - 1]),
  });
}

async function readSseResponse(response, startedAt) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstByteMs = 0;
  let ttftMs = 0;
  let networkChunkCount = 0;
  let networkBytes = 0;
  let sseEventCount = 0;
  let jsonEventCount = 0;
  let outputCharCount = 0;
  let doneSeen = false;
  let usage = null;
  let model = null;
  let jsonErrorCount = 0;
  const eventTimes = [];
  const objectTypes = new Set();
  const finishReasons = new Set();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const now = performance.now();
    if (!firstByteMs) firstByteMs = roundMs(now - startedAt);
    networkChunkCount += 1;
    networkBytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });

    const drained = drainSseDataEvents(buffer);
    buffer = drained.rest;
    for (const data of drained.events) {
      sseEventCount += 1;
      if (!ttftMs) ttftMs = roundMs(now - startedAt);
      eventTimes.push(now - startedAt);

      if (data === '[DONE]') {
        doneSeen = true;
        continue;
      }

      try {
        const parsed = JSON.parse(data);
        jsonEventCount += 1;
        if (parsed.object) objectTypes.add(parsed.object);
        if (parsed.model) model = parsed.model;
        if (parsed.usage) usage = parsed.usage;
        collectChoiceSignals(parsed, finishReasons);
        outputCharCount += countOutputChars(parsed);
      } catch {
        jsonErrorCount += 1;
      }
    }
  }

  buffer += decoder.decode();
  const trailing = drainSseDataEvents(`${buffer}\n\n`);
  for (const data of trailing.events) {
    if (!data) continue;
    sseEventCount += 1;
    const now = performance.now();
    if (!ttftMs) ttftMs = roundMs(now - startedAt);
    eventTimes.push(now - startedAt);
    if (data === '[DONE]') {
      doneSeen = true;
      continue;
    }
    try {
      const parsed = JSON.parse(data);
      jsonEventCount += 1;
      if (parsed.object) objectTypes.add(parsed.object);
      if (parsed.model) model = parsed.model;
      if (parsed.usage) usage = parsed.usage;
      collectChoiceSignals(parsed, finishReasons);
      outputCharCount += countOutputChars(parsed);
    } catch {
      jsonErrorCount += 1;
    }
  }

  const latencyMs = elapsedMs(startedAt);
  const gapStats = summarizeIntervals(eventTimes);
  const outputTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  const generationMs = ttftMs ? Math.max(1, latencyMs - ttftMs) : 0;

  return Object.freeze({
    ok: response.ok,
    status: response.status,
    latencyMs,
    headers: Object.freeze(Object.fromEntries(response.headers.entries())),
    usage,
    model,
    metrics: Object.freeze({
      firstByteMs,
      ttftMs,
      totalLatencyMs: latencyMs,
      networkChunkCount,
      networkBytes,
      sseEventCount,
      jsonEventCount,
      chunkGapMsAvg: gapStats.avg,
      chunkGapMsP95: gapStats.p95,
      tokensPerSecond: outputTokens ? roundNumber((outputTokens * 1000) / generationMs, 2) : 0,
      outputCharCount,
    }),
    signals: Object.freeze({
      doneSeen,
      finishReasons: Object.freeze([...finishReasons]),
      objectTypes: Object.freeze([...objectTypes]),
      jsonErrorCount,
    }),
    errorText: '',
  });
}

function streamFailure({ response, startedAt, errorText }) {
  return Object.freeze({
    ok: false,
    status: response.status,
    latencyMs: elapsedMs(startedAt),
    headers: Object.freeze(Object.fromEntries(response.headers.entries())),
    usage: null,
    model: null,
    metrics: Object.freeze({
      firstByteMs: 0,
      ttftMs: 0,
      totalLatencyMs: elapsedMs(startedAt),
      networkChunkCount: 0,
      networkBytes: 0,
      sseEventCount: 0,
      jsonEventCount: 0,
      chunkGapMsAvg: 0,
      chunkGapMsP95: 0,
      tokensPerSecond: 0,
      outputCharCount: 0,
    }),
    signals: Object.freeze({
      doneSeen: false,
      finishReasons: Object.freeze([]),
      objectTypes: Object.freeze([]),
      jsonErrorCount: 0,
    }),
    errorText,
  });
}

function collectChoiceSignals(parsed, finishReasons) {
  if (!Array.isArray(parsed.choices)) return;
  for (const choice of parsed.choices) {
    if (choice.finish_reason) finishReasons.add(choice.finish_reason);
  }
}

function countOutputChars(parsed) {
  if (!Array.isArray(parsed.choices)) return 0;
  let count = 0;
  for (const choice of parsed.choices) {
    const content = choice.delta?.content ?? choice.message?.content ?? '';
    if (typeof content === 'string') count += content.length;
  }
  return count;
}

function validateExternalHttps(urlString) {
  const url = new URL(urlString);
  if (url.protocol !== 'https:') {
    throw new Error(`refusing non-HTTPS gateway URL: ${url.protocol}`);
  }
}

function elapsedMs(startedAt) {
  return roundMs(performance.now() - startedAt);
}

function roundMs(value) {
  return Math.round(Number(value) * 100) / 100;
}

function roundNumber(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}
