import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve('packages/cli/bin/gatewaycheck.mjs');

test('prints GatewayCheck help', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GatewayCheck/);
  assert.match(result.stdout, /gatewaycheck audit/);
  assert.match(result.stdout, /gatewaycheck doctor/);
  assert.match(result.stdout, /--lang <name>/);
  assert.match(result.stdout, /--plan-only/);
});

test('rejects raw API key flags', () => {
  const result = runCli(['audit', '--api-key', 'sk-test', '--yes']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /do not pass raw API keys/);
});

test('requires configured key env before live audit', () => {
  const result = runCli([
    'audit',
    '--base-url',
    'https://api.example.com',
    '--key-env',
    'GATEWAYCHECK_TEST_MISSING_KEY',
    '--yes',
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing API key environment variable/);
});

test('runs local release doctor', () => {
  const result = runCli(['doctor']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Doctor found/);
  assert.match(result.stdout, /no blocking issues|no release readiness issues/);
});

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      GATEWAYCHECK_TEST_MISSING_KEY: '',
    },
  });
}
