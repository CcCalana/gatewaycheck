import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBenchmarkReport,
  summarizeResponseHeaders,
} from '../src/index.mjs';

test('creates benchmark report envelope', () => {
  const report = createBenchmarkReport({
    suite: 'stream',
    config: { name: 'Test Gateway', baseUrl: 'https://api.example.com' },
    startedAt: new Date('2026-05-16T00:00:00.000Z'),
    finishedAt: new Date('2026-05-16T00:00:02.000Z'),
    requestCount: 1,
    maxOutputTokens: 64,
    results: [{ id: 'probe-a', status: 'pass' }, { id: 'probe-b', status: 'fail' }],
  });

  assert.equal(report.schemaVersion, '0.2');
  assert.equal(report.gateway.name, 'Test Gateway');
  assert.equal(report.run.id, 'local-stream-20260516000000');
  assert.equal(report.run.durationMs, 2000);
  assert.equal(report.summary.passCount, 1);
  assert.equal(report.summary.failCount, 1);
});

test('summarizes safe response headers', () => {
  const summary = summarizeResponseHeaders({
    'X-Request-Id': 'req_123',
    'Retry-After': '2',
    'X-RateLimit-Remaining-Requests': '49',
    Traceparent: '00-abc-def-01',
  });

  assert.equal(summary.requestId, 'req_123');
  assert.equal(summary.retryAfter, '2');
  assert.equal(summary.rateLimit['x-ratelimit-remaining-requests'], '49');
  assert.equal(summary.trace.traceparent, true);
});
