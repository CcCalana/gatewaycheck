import { performance } from 'node:perf_hooks';
import { validateExternalHttps } from './utils.mjs';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const SECRET_PATTERNS = [
  /sk-ant?-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /"api[_-]?key"\s*:\s*"[^"]+"/gi,
  /"access_token"\s*:\s*"[^"]+"/gi,
  /"secret"\s*:\s*"[A-Za-z0-9+/=]{20,}"/gi,
  /[?&](token|key|secret|auth)=[A-Za-z0-9_-]{15,}/gi,
  /set-cookie[^;]*=[^;]+/gi,
];

export function buildUrl(baseUrl, path) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  const nextPath = String(path || '').replace(/^\/+/, '');
  url.pathname = `${basePath}/${nextPath}`.replace(/\/{2,}/g, '/');
  return url.toString();
}

export async function requestJson({
  baseUrl,
  path,
  method = 'GET',
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
    Accept: 'application/json',
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
    const text = await response.text();
    const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: sanitizeForLog(text, 2000) };
      }
    }
    return Object.freeze({
      ok: response.ok,
      status: response.status,
      latencyMs,
      data,
      headers: Object.freeze(Object.fromEntries(response.headers.entries())),
      errorText: response.ok ? '' : sanitizeForLog(text, 1000),
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      status: 0,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      data: null,
      headers: Object.freeze({}),
      errorText: error.name === 'AbortError' ? 'request timeout' : sanitizeForLog(error.message),
    });
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeForLog(value, maxLen = 500) {
  let output = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  output = output.replace(CONTROL_CHARS, '');
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '[REDACTED]');
  }
  return output.slice(0, maxLen);
}
