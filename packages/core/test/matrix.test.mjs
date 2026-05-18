import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMatrixPlan, summarizeMatrixResults } from '../src/index.mjs';

test('resolves configured matrix model/protocol plan', () => {
  const plan = resolveMatrixPlan({
    matrix: {
      models: [
        { id: 'model-a', protocols: ['openai-chat', 'openai-stream'] },
        { id: 'model-b', protocols: ['openai-chat', 'openai-responses'] },
      ],
    },
  });

  assert.deepEqual(plan.map((item) => `${item.protocol}:${item.model}`), [
    'openai-chat:model-a',
    'openai-stream:model-a',
    'openai-chat:model-b',
    'openai-responses:model-b',
  ]);
});

test('infers matrix plan from legacy model config', () => {
  const plan = resolveMatrixPlan({
    models: {
      openai: 'gpt-test',
      claude: 'claude-test',
      gemini: 'gemini-test',
    },
    matrix: {
      protocols: ['openai-chat', 'openai-tools'],
    },
  });

  assert.deepEqual(plan.map((item) => `${item.protocol}:${item.model}`), [
    'openai-chat:gpt-test',
    'openai-tools:gpt-test',
    'anthropic-messages:claude-test',
    'gemini-generate:gemini-test',
  ]);
});

test('summarizes matrix results by protocol and model', () => {
  const summary = summarizeMatrixResults([
    { protocol: 'openai-chat', model: 'a', status: 'pass', latencyMs: 100 },
    { protocol: 'openai-chat', model: 'b', status: 'fail', latencyMs: 200 },
    { protocol: 'openai-stream', model: 'a', status: 'skip', latencyMs: 0 },
  ]);

  assert.equal(summary.modelCount, 2);
  assert.equal(summary.protocolCount, 2);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.byProtocol['openai-chat'].pass, 1);
  assert.equal(summary.byProtocol['openai-chat'].fail, 1);
  assert.equal(summary.byProtocol['openai-chat'].avgLatencyMs, 150);
  assert.equal(summary.byModel.a.skip, 1);
});
