import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentError, createAgentFacts } from '../src/index.mjs';

test('creates compact agent facts for audit reports', () => {
  const facts = createAgentFacts({
    suite: 'audit',
    gateway: { name: 'Gateway', baseUrl: 'https://api.example.com', family: 'new-api-like' },
    generatedAt: '2026-05-18T00:00:00.000Z',
    requestCount: 5,
    auditPlan: [{ id: 'model-a', protocols: ['openai-chat', 'openai-stream'], label: 'cheap' }],
    discovery: {
      gateway: { family: 'new-api-like' },
      requestCount: 3,
      probes: [
        { id: 'models', endpoint: '/v1/models', status: 'pass', httpStatus: 200, latencyMs: 90 },
      ],
      modelSummary: { count: 2, sample: ['model-a', 'model-b'] },
      pricingSummary: { modelCount: 3, groups: ['default'], vendors: ['OpenAI'] },
    },
    matrix: {
      run: { requestCount: 2, maxOutputTokens: 64 },
      summary: {
        passCount: 1,
        failCount: 1,
        skippedCount: 0,
        protocols: ['openai-chat', 'openai-stream'],
        models: ['model-a'],
      },
      results: [
        {
          id: 'openai-chat:model-a',
          protocol: 'openai-chat',
          endpoint: '/v1/chat/completions',
          method: 'POST',
          status: 'pass',
          httpStatus: 200,
          latencyMs: 120,
          model: 'model-a',
          resolvedModel: 'model-a-upstream',
          usage: { promptTokens: 10, completionTokens: 2, cachedTokens: 5, reasoningTokens: 0 },
          signals: { finishReason: 'stop' },
        },
        {
          id: 'openai-stream:model-a',
          protocol: 'openai-stream',
          endpoint: '/v1/chat/completions',
          method: 'POST',
          status: 'fail',
          httpStatus: 400,
          latencyMs: 80,
          model: 'model-a',
          usage: { promptTokens: 1, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0 },
          error: 'stream unsupported',
        },
      ],
    },
  });

  assert.equal(facts.mode, 'agent');
  assert.equal(facts.exitCode, 0);
  assert.equal(facts.status, 'degraded');
  assert.equal(facts.facts.auth_status.ok, true);
  assert.equal(facts.facts.discovery.visible_model_count, 2);
  assert.equal(facts.facts.matrix.fail_count, 1);
  assert.equal(facts.facts.token_usage.cached_tokens, 5);
  assert.equal(facts.facts.token_usage.cache_hit, true);
  assert.equal(facts.facts.routing.changed, true);
  assert.equal(facts.facts.probes.find((probe) => probe.protocol === 'openai-stream').error, 'stream unsupported');
});

test('marks auth and network blockers as fatal for agent exit codes', () => {
  const authFacts = createAgentFacts({
    suite: 'matrix',
    gateway: { name: 'Gateway', baseUrl: 'https://api.example.com' },
    run: { suite: 'matrix', requestCount: 1 },
    results: [
      {
        id: 'openai-chat:model-a',
        protocol: 'openai-chat',
        status: 'fail',
        httpStatus: 401,
        latencyMs: 50,
        model: 'model-a',
        error: 'invalid api key',
      },
    ],
    summary: { passCount: 0, failCount: 1, protocols: ['openai-chat'], models: ['model-a'] },
  });
  assert.equal(authFacts.exitCode, 1);
  assert.equal(authFacts.facts.auth_status.http_status, 401);

  const errorFacts = createAgentError(new Error('missing API key environment variable: GATEWAY_API_KEY'));
  assert.equal(errorFacts.ok, false);
  assert.equal(errorFacts.exitCode, 1);
  assert.match(errorFacts.facts.error.message, /GATEWAY_API_KEY/);
});
