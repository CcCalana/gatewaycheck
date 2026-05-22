import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiKey, validateConfig } from '../src/index.mjs';

test('resolveApiKey reads from environment variable', () => {
  const config = { apiKeyEnv: 'TEST_KEY' };
  const env = { TEST_KEY: 'sk-test-value' };
  assert.equal(resolveApiKey(config, env), 'sk-test-value');
});

test('resolveApiKey throws when env variable is not set', () => {
  const config = { apiKeyEnv: 'MISSING_KEY' };
  assert.throws(() => resolveApiKey(config, {}), /missing API key environment variable/);
});

test('resolveApiKey returns empty string when apiKeyEnv is empty', () => {
  const config = { apiKeyEnv: '' };
  assert.equal(resolveApiKey(config, {}), '');
});

test('validateConfig rejects non-object configs', () => {
  assert.throws(() => validateConfig(null), /must be an object/);
  assert.throws(() => validateConfig('string'), /must be an object/);
});

test('validateConfig rejects configs without baseUrl', () => {
  assert.throws(() => validateConfig({}), /config\.baseUrl is required/);
  assert.throws(() => validateConfig({ baseUrl: 123 }), /config\.baseUrl is required/);
});

test('validateConfig rejects inline API keys', () => {
  assert.throws(() => validateConfig({ baseUrl: 'https://api.example.com', apiKey: 'sk-raw-key' }), /do not store raw API keys/);
});

test('validateConfig allows apiKeyEnv references with template patterns', () => {
  assert.doesNotThrow(() => validateConfig({
    baseUrl: 'https://api.example.com',
    apiKey: '${GATEWAY_API_KEY}',
  }));
});

test('validateConfig allows valid configs', () => {
  assert.doesNotThrow(() => validateConfig({
    name: 'Test',
    baseUrl: 'https://api.example.com',
    apiKeyEnv: 'GATEWAY_API_KEY',
  }));
});

test('validateConfig validates baseUrl format', () => {
  assert.throws(() => validateConfig({ baseUrl: 'not-a-url' }), { message: /Invalid URL/ });
});
