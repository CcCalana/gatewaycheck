import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOpenAIUsage,
  normalizeResponsesUsage,
  normalizeClaudeUsage,
  normalizeGeminiUsage,
  cacheHitRatePct,
} from '../src/index.mjs';

test('normalizes OpenAI cached token usage', () => {
  const usage = normalizeOpenAIUsage({
    prompt_tokens: 3526,
    completion_tokens: 25,
    total_tokens: 3551,
    completion_tokens_details: { reasoning_tokens: 7 },
    prompt_tokens_details: { cached_tokens: 3328 },
  });
  assert.equal(usage.promptTokens, 3526);
  assert.equal(usage.cachedTokens, 3328);
  assert.equal(usage.reasoningTokens, 7);
  assert.equal(usage.cacheHitRatePct, 94.38);
});

test('normalizes Responses usage', () => {
  const usage = normalizeResponsesUsage({
    input_tokens: 55,
    output_tokens: 18,
    total_tokens: 73,
  });
  assert.equal(usage.promptTokens, 55);
  assert.equal(usage.completionTokens, 18);
  assert.equal(usage.totalTokens, 73);
});

test('normalizes Claude cache usage', () => {
  const usage = normalizeClaudeUsage({
    input_tokens: 663,
    output_tokens: 33,
    cache_read_input_tokens: 512,
    cache_creation_input_tokens: 128,
  });
  assert.equal(usage.cachedTokens, 512);
  assert.equal(usage.cacheWriteTokens, 128);
});

test('handles zero prompt cache rate', () => {
  assert.equal(cacheHitRatePct(10, 0), 0);
});

test('normalizes missing usage objects', () => {
  const usage = normalizeOpenAIUsage(null);
  assert.equal(usage.promptTokens, 0);
  assert.equal(usage.completionTokens, 0);
  assert.equal(usage.totalTokens, 0);
  assert.equal(usage.cachedTokens, 0);
});

test('normalizes Gemini usage metadata', () => {
  const usage = normalizeGeminiUsage({
    promptTokenCount: 12,
    candidatesTokenCount: 3,
    totalTokenCount: 20,
    cachedContentTokenCount: 5,
    thoughtsTokenCount: 4,
  });
  assert.equal(usage.promptTokens, 12);
  assert.equal(usage.completionTokens, 3);
  assert.equal(usage.totalTokens, 20);
  assert.equal(usage.cachedTokens, 5);
  assert.equal(usage.reasoningTokens, 4);
});
