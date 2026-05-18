import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCachePrompt } from '../src/index.mjs';

test('builds stable basic cache prompt', () => {
  const a = buildCachePrompt('basic');
  const b = buildCachePrompt('basic');
  assert.equal(a.system, b.system);
  assert.match(a.system, /Rule 70/);
});

test('builds larger agent cache prompt', () => {
  const prompt = buildCachePrompt('agent');
  assert.match(prompt.system, /Stable policy appendix/);
  assert.match(prompt.system, /Rule 90/);
  assert.match(prompt.user, /final_word/);
});
