import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve('packages/cli/bin/gatewaycheck.mjs');

test('prints GatewayCheck help', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GatewayCheck/);
  assert.match(result.stdout, /gatewaycheck https:\/\/api\.example\.com/);
  assert.match(result.stdout, /gatewaycheck prompt https:\/\/api\.example\.com/);
  assert.match(result.stdout, /gatewaycheck install/);
  assert.match(result.stdout, /gatewaycheck audit/);
  assert.match(result.stdout, /gatewaycheck skill --install/);
  assert.match(result.stdout, /gatewaycheck doctor/);
  assert.match(result.stdout, /--lang <name>/);
  assert.match(result.stdout, /--plan-only/);
});

test('rejects raw API key flags', () => {
  const result = runCli(['audit', '--api-key', 'sk-test', '--yes']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /do not pass raw API keys/);
});

test('rejects raw API key equals flags', () => {
  const result = runCli(['audit', '--api-key=sk-test', '--yes']);
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
  assert.match(result.stderr, /PowerShell/);
});

test('runs local release doctor', () => {
  const result = runCli(['doctor']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Doctor found/);
  assert.match(result.stdout, /no blocking issues|no release readiness issues/);
});

test('prints agent-ready prompt', () => {
  const result = runCli(['prompt', 'https://api.example.com']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Copy this prompt into Codex/);
  assert.match(result.stdout, /Gateway URL: https:\/\/api\.example\.com/);
  assert.match(result.stdout, /Do not ask me to paste the API key into chat/);
});

test('prints menu for no-argument non-tty use', () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Agent mode: install Skill \+ CLI/);
  assert.match(result.stdout, /CLI mode: run a guided audit/);
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
