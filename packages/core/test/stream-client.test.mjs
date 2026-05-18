import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drainSseDataEvents,
  parseSseDataBlock,
  summarizeIntervals,
} from '../src/index.mjs';

test('parses SSE data blocks', () => {
  const data = parseSseDataBlock('event: message\ndata: {"ok":true}');
  assert.equal(data, '{"ok":true}');
});

test('joins multiline SSE data blocks', () => {
  const data = parseSseDataBlock('data: {"a":1,\ndata: "b":2}');
  assert.equal(data, '{"a":1,\n"b":2}');
});

test('drains complete SSE events and preserves partial remainder', () => {
  const drained = drainSseDataEvents('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"partial"');
  assert.deepEqual(drained.events, ['{"a":1}', '[DONE]']);
  assert.equal(drained.rest, 'data: {"partial"');
});

test('summarizes event intervals', () => {
  const summary = summarizeIntervals([10, 20, 50, 110]);
  assert.equal(summary.avg, 33.33);
  assert.equal(summary.p95, 60);
  assert.equal(summary.max, 60);
});
