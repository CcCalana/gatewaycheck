import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAudit,
  buildAuditMatrixConfig,
  renderAuditMarkdown,
  selectAuditModels,
} from '../src/index.mjs';

test('selects low-cost audit candidates from visible pricing models', () => {
  const selected = selectAuditModels({
    availableModels: ['qwen3.5-flash', 'deepseek-v4-flash', 'claude-haiku'],
    pricingModels: [
      { id: 'qwen3.5-flash', modelRatio: 0.1, completionRatio: 10, endpoints: ['openai'] },
      { id: 'deepseek-v4-flash', modelRatio: 0.5, completionRatio: 2, endpoints: ['openai'] },
      { id: 'claude-haiku', modelRatio: 0.5, completionRatio: 5, endpoints: ['anthropic', 'openai'] },
    ],
    maxModels: 3,
  });

  assert.equal(selected[0].id, 'qwen3.5-flash');
  assert.deepEqual(selected[0].protocols, ['openai-chat', 'openai-stream', 'openai-tools']);
  assert.equal(selected.some((item) => item.id === 'deepseek-v4-flash'), true);
  assert.equal(selected.some((item) => item.id === 'claude-haiku'), true);
});

test('builds audit matrix config with request budget overrides', () => {
  const { config, plan } = buildAuditMatrixConfig(
    { name: 'Gateway', baseUrl: 'https://api.example.com', requestBudget: { maxRequests: 2 } },
    {
      modelSummary: { sample: ['model-a'] },
      pricingModels: [{ id: 'model-a', modelRatio: 0.1, completionRatio: 1, endpoints: ['openai'] }],
    },
    { maxRequests: 4, maxOutputTokens: 64 }
  );

  assert.equal(config.requestBudget.maxRequests, 4);
  assert.equal(config.requestBudget.maxOutputTokens, 64);
  assert.equal(config.matrix.models[0].id, 'model-a');
  assert.equal(plan.length, 1);
});

test('falls back to configured chat model when visible model is non-chat', () => {
  const { config, plan } = buildAuditMatrixConfig(
    {
      name: 'Gateway',
      baseUrl: 'https://api.example.com',
      models: { openai: 'qwen3.5-flash' },
    },
    {
      modelSummary: { sample: ['omni-moderation-latest'] },
      pricingModels: [
        { id: 'omni-moderation-latest', modelPrice: 0.01, endpoints: ['openai'] },
        { id: 'qwen3.5-flash', modelRatio: 0.1, completionRatio: 10, endpoints: ['openai'] },
      ],
    },
    { maxModels: 2 }
  );

  assert.equal(config.matrix.models[0].id, 'qwen3.5-flash');
  assert.equal(plan[0].id, 'qwen3.5-flash');
});

test('filters non-chat models from audit selection', () => {
  const selected = selectAuditModels({
    availableModels: ['omni-moderation-latest', 'gpt-image-2', 'qwen3.5-flash'],
    pricingModels: [
      { id: 'omni-moderation-latest', modelPrice: 0.01, endpoints: ['openai'] },
      { id: 'gpt-image-2', modelPrice: 0.04, endpoints: ['openai'] },
      { id: 'qwen3.5-flash', modelRatio: 0.1, completionRatio: 10, endpoints: ['openai'] },
    ],
    maxModels: 1,
  });

  assert.equal(selected[0].id, 'qwen3.5-flash');
});

test('adds representative models from pricing catalog', () => {
  const selected = selectAuditModels({
    availableModels: ['omni-moderation-latest'],
    configModels: ['qwen3.5-flash'],
    pricingModels: [
      { id: 'omni-moderation-latest', modelPrice: 0.01, endpoints: ['openai'] },
      { id: 'qwen3.5-flash', modelRatio: 0.1, completionRatio: 10, endpoints: ['openai'] },
      { id: 'deepseek-v4-flash', modelRatio: 0.5, completionRatio: 2, endpoints: ['openai'] },
      { id: 'claude-haiku', modelRatio: 0.5, completionRatio: 5, endpoints: ['anthropic', 'openai'] },
      { id: 'gemini-2.5-flash', modelRatio: 0.15, completionRatio: 8, endpoints: ['gemini', 'openai'] },
    ],
    maxModels: 4,
  });

  assert.equal(selected.some((item) => item.id === 'qwen3.5-flash'), true);
  assert.equal(selected.some((item) => item.id === 'deepseek-v4-flash'), true);
  assert.equal(selected.some((item) => item.id === 'claude-haiku'), true);
  assert.equal(selected.some((item) => item.id === 'gemini-2.5-flash'), true);
});

test('infers protocol families from configured models without pricing metadata', () => {
  const selected = selectAuditModels({
    configuredModels: [
      { role: 'openai', id: 'gpt-5.3-codex' },
      { role: 'claude', id: 'claude-opus-4-6' },
      { role: 'gemini', id: 'gemini-3-pro-preview' },
    ],
    maxModels: 3,
  });

  const byId = Object.fromEntries(selected.map((item) => [item.id, item]));
  assert.deepEqual(byId['gpt-5.3-codex'].protocols, [
    'openai-responses',
    'openai-chat',
    'openai-stream',
    'openai-tools',
  ]);
  assert.deepEqual(byId['claude-opus-4-6'].protocols, ['anthropic-messages']);
  assert.deepEqual(byId['gemini-3-pro-preview'].protocols, ['gemini-generate']);
});

test('renders markdown audit report', () => {
  const analysis = analyzeAudit(
    { modelSummary: { count: 1 } },
    {
      results: [
        {
          model: 'model-a',
          protocol: 'openai-chat',
          status: 'pass',
          httpStatus: 200,
          latencyMs: 100,
          usage: { promptTokens: 1, completionTokens: 2, reasoningTokens: 0, cachedTokens: 0 },
          signals: { finishReason: 'stop' },
        },
      ],
    }
  );
  const md = renderAuditMarkdown({
    gateway: { name: 'Gateway', baseUrl: 'https://api.example.com' },
    generatedAt: '2026-05-17T00:00:00.000Z',
    discovery: {
      gateway: { family: 'new-api-like' },
      modelSummary: { count: 1 },
      pricingSummary: { modelCount: 3 },
    },
    matrix: {
      summary: { passCount: 1, failCount: 0, protocols: ['openai-chat'], byProtocol: {} },
      results: [
        {
          model: 'model-a',
          protocol: 'openai-chat',
          status: 'pass',
          httpStatus: 200,
          latencyMs: 100,
          usage: { promptTokens: 1, completionTokens: 2 },
          signals: { finishReason: 'stop' },
        },
      ],
    },
    analysis,
    auditPlan: [{ id: 'model-a', protocols: ['openai-chat'], label: 'Candidate' }],
  });

  assert.match(md, /GatewayCheck Audit Report/);
  assert.match(md, /Recommended Actions/);
  assert.match(md, /model-a/);
  assert.match(md, /openai-chat/);
});

test('renders Chinese markdown audit report when requested', () => {
  const analysis = analyzeAudit(
    { modelSummary: { count: 0 }, pricingSummary: { modelCount: 0 } },
    { summary: { passCount: 0, failCount: 1, protocols: ['openai-chat'], byProtocol: {} }, results: [] },
    { language: 'zh' }
  );
  const md = renderAuditMarkdown({
    gateway: { name: 'Gateway', baseUrl: 'https://api.example.com' },
    generatedAt: '2026-05-17T00:00:00.000Z',
    requestCount: 1,
    language: 'zh',
    discovery: {
      gateway: { family: 'unknown' },
      modelSummary: { count: 0 },
      pricingSummary: { modelCount: 0 },
    },
    matrix: {
      summary: { passCount: 0, failCount: 1, protocols: ['openai-chat'], byProtocol: {} },
      results: [],
    },
    analysis,
    auditPlan: [],
  }, { language: 'zh' });

  assert.match(md, /GatewayCheck 审计报告/);
  assert.match(md, /执行摘要/);
  assert.match(md, /建议动作/);
  assert.match(md, /未发现公开价格目录/);
});
