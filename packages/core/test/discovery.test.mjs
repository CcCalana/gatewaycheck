import test from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { discoverGateway } from '../src/index.mjs';

const CONFIG = {
  name: 'Test Gateway',
  baseUrl: 'https://api.test.com',
  requestBudget: { timeoutMs: 5000 },
};

test('discoverGateway returns public metadata without API key', async () => {
  nock('https://api.test.com')
    .get('/api/status')
    .reply(200, { data: { server_address: 'gateway.test', system_name: 'test' } });
  nock('https://api.test.com')
    .get('/api/pricing')
    .reply(200, {
      data: [
        { model_name: 'test-model-a', model_ratio: 0.5, completion_ratio: 10, enable_groups: ['default'] },
        { model_name: 'test-model-b', model_ratio: 0.2, completion_ratio: 5, enable_groups: ['default'] },
      ],
    });

  const report = await discoverGateway(CONFIG, '');

  assert.equal(report.suite, 'discovery');
  assert.equal(report.requestCount, 2);
  assert.equal(report.gateway.family, 'openai-compatible-dashboard');
  assert.equal(report.modelSummary, null);
  assert.equal(report.pricingSummary.modelCount, 2);
  assert.equal(report.probes.length, 2);
  nock.cleanAll();
});

test('discoverGateway includes model list when API key is provided', async () => {
  nock('https://api.test.com')
    .get('/api/status')
    .reply(200, { data: {} });
  nock('https://api.test.com')
    .get('/api/pricing')
    .reply(200, { data: [] });
  nock('https://api.test.com')
    .get('/v1/models')
    .reply(200, { object: 'list', data: [{ id: 'model-a' }, { id: 'model-b' }] });

  const report = await discoverGateway(CONFIG, 'sk-test');

  assert.equal(report.requestCount, 3);
  assert.equal(report.modelSummary.count, 2);
  assert.deepEqual(report.modelSummary.sample, ['model-a', 'model-b']);
  nock.cleanAll();
});

test('discoverGateway identifies New API gateways', async () => {
  nock('https://api.test.com')
    .get('/api/status')
    .reply(200, { data: { docs_link: 'https://docs.newapi.pro/guide' } });
  nock('https://api.test.com')
    .get('/api/pricing')
    .reply(200, { data: [] });

  const report = await discoverGateway(CONFIG, '');

  assert.equal(report.gateway.family, 'new-api');
  nock.cleanAll();
});

test('discoverGateway marks failed endpoints', async () => {
  nock('https://api.test.com')
    .get('/api/status')
    .reply(404, { error: 'not found' });
  nock('https://api.test.com')
    .get('/api/pricing')
    .reply(404, { error: 'not found' });

  const report = await discoverGateway(CONFIG, '');

  assert.equal(report.probes[0].status, 'fail');
  assert.equal(report.probes[1].status, 'fail');
  nock.cleanAll();
});
