import test from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { buildUrl, requestJson, sanitizeForLog } from '../src/index.mjs';
import { validateExternalHttps } from '../src/runtime/utils.mjs';

test('buildUrl joins base URL with path', () => {
  assert.equal(buildUrl('https://api.example.com', '/v1/models'), 'https://api.example.com/v1/models');
  assert.equal(buildUrl('https://api.example.com/', 'v1/models'), 'https://api.example.com/v1/models');
  assert.equal(buildUrl('https://api.example.com/v1/', '/chat/completions'), 'https://api.example.com/v1/chat/completions');
});

test('sanitizeForLog redacts OpenAI keys', () => {
  const input = 'error with key sk-proj-abc123def456ghi789';
  const output = sanitizeForLog(input, 500);
  assert.match(output, /\[REDACTED\]/);
  assert.doesNotMatch(output, /sk-proj/);
});

test('sanitizeForLog redacts Anthropic keys', () => {
  const input = 'Auth: sk-ant-api03-xxxxxxxxxxxxxxx-yyy';
  const output = sanitizeForLog(input, 500);
  assert.match(output, /\[REDACTED\]/);
  assert.doesNotMatch(output, /sk-ant/);
});

test('sanitizeForLog redacts Google API keys', () => {
  const input = 'key=AIzaSyC8jHxampleRANDOMstring1234567890';
  const output = sanitizeForLog(input, 500);
  assert.match(output, /\[REDACTED\]/);
  assert.doesNotMatch(output, /AIza/);
});

test('sanitizeForLog redacts Bearer tokens', () => {
  const input = 'Authorization: Bearer abc123def456ghi789jkl';
  const output = sanitizeForLog(input, 500);
  assert.match(output, /\[REDACTED\]/);
  assert.doesNotMatch(output, /Bearer\s+abc/);
});

test('sanitizeForLog redacts JSON api_key fields', () => {
  const input = '{"api_key": "secret-value-here"}';
  const output = sanitizeForLog(input, 500);
  assert.match(output, /\[REDACTED\]/);
  assert.doesNotMatch(output, /secret-value-here/);
});

test('sanitizeForLog redacts set-cookie headers', () => {
  const input = 'set-cookie: session=abc123SecureToken; Path=/';
  const output = sanitizeForLog(input, 500);
  assert.match(output, /\[REDACTED\]/);
});

test('sanitizeForLog removes control characters', () => {
  const input = 'hello\x00\x01\x1fworld';
  const output = sanitizeForLog(input, 500);
  assert.equal(output, 'helloworld');
});

test('sanitizeForLog truncates to max length', () => {
  const output = sanitizeForLog('abcdefghij', 5);
  assert.equal(output.length, 5);
  assert.equal(output, 'abcde');
});

test('sanitizeForLog handles non-string input', () => {
  const output = sanitizeForLog({ error: 'test' }, 100);
  assert.equal(output, JSON.stringify({ error: 'test' }));
});

test('validateExternalHttps rejects HTTP URLs', () => {
  assert.throws(() => validateExternalHttps('http://api.example.com/v1'), /non-HTTPS/);
});

test('validateExternalHttps rejects localhost', () => {
  assert.throws(() => validateExternalHttps('https://localhost/v1'), /internal\/reserved/);
});

test('validateExternalHttps rejects 127.0.0.1', () => {
  assert.throws(() => validateExternalHttps('https://127.0.0.1/v1'), /refusing/);
});

test('validateExternalHttps rejects private IPs', () => {
  assert.throws(() => validateExternalHttps('https://10.0.0.1/v1'), /private\/reserved/);
  assert.throws(() => validateExternalHttps('https://192.168.1.1/v1'), /private\/reserved/);
  assert.throws(() => validateExternalHttps('https://172.16.0.1/v1'), /private\/reserved/);
});

test('validateExternalHttps rejects link-local IPs', () => {
  assert.throws(() => validateExternalHttps('https://169.254.1.1/v1'), /private\/reserved/);
});

test('validateExternalHttps rejects .internal hostnames', () => {
  assert.throws(() => validateExternalHttps('https://db.internal/v1'), /internal\/reserved/);
});

test('validateExternalHttps rejects metadata.google.internal', () => {
  assert.throws(() => validateExternalHttps('https://metadata.google.internal/v1'), /internal\/reserved/);
});

test('validateExternalHttps allows public HTTPS URLs', () => {
  assert.doesNotThrow(() => validateExternalHttps('https://api.example.com/v1'));
  assert.doesNotThrow(() => validateExternalHttps('https://api.openai.com/v1'));
});

test('requestJson sends authorization header and parses JSON response', async () => {
  nock('https://api.example.com')
    .post('/v1/chat/completions')
    .matchHeader('authorization', 'Bearer sk-test-key')
    .reply(200, { object: 'chat.completion', model: 'test-model' });

  const result = await requestJson({
    baseUrl: 'https://api.example.com',
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey: 'sk-test-key',
    body: { model: 'test-model', messages: [] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.data.object, 'chat.completion');
  assert.ok(result.latencyMs > 0);
  nock.cleanAll();
});

test('requestJson handles HTTP errors', async () => {
  nock('https://api.example.com')
    .get('/v1/models')
    .reply(401, { error: { message: 'invalid api key' } });

  const result = await requestJson({
    baseUrl: 'https://api.example.com',
    path: '/v1/models',
    apiKey: 'sk-bad-key',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  nock.cleanAll();
});

