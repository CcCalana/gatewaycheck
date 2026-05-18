import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const cli = resolve('packages/cli/bin/gatewaycheck.mjs');

test('prints GatewayCheck help', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GatewayCheck/);
  assert.match(result.stdout, /gatewaycheck https:\/\/api\.example\.com/);
  assert.match(result.stdout, /gatewaycheck bootstrap/);
  assert.match(result.stdout, /gatewaycheck prompt https:\/\/api\.example\.com/);
  assert.match(result.stdout, /gatewaycheck install/);
  assert.match(result.stdout, /gatewaycheck init --config/);
  assert.match(result.stdout, /gatewaycheck audit/);
  assert.match(result.stdout, /gatewaycheck skill --install/);
  assert.match(result.stdout, /gatewaycheck doctor/);
  assert.match(result.stdout, /--lang <name>/);
  assert.match(result.stdout, /--agent/);
  assert.match(result.stdout, /--json-only/);
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
  assert.match(result.stdout, /--agent/);
  assert.match(result.stdout, /machine-readable JSON facts/);
  assert.match(result.stdout, /Do not ask me to paste the API key into chat/);
});

test('prints agent bootstrap instruction without gateway details', () => {
  const result = runCli(['bootstrap']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /npx gatewaycheck install/);
  assert.match(result.stdout, /ask me for the gateway URL/);
  assert.doesNotMatch(result.stdout, /Gateway URL:/);
});

test('prints machine-readable JSON for agent errors', () => {
  const result = runCli([
    'audit',
    '--base-url',
    'https://api.example.com',
    '--key-env',
    'GATEWAYCHECK_TEST_MISSING_KEY',
    '--yes',
    '--agent',
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.mode, 'agent');
  assert.equal(payload.ok, false);
  assert.equal(payload.exitCode, 1);
  assert.match(payload.facts.error.message, /GATEWAYCHECK_TEST_MISSING_KEY/);
});

test('prints menu for no-argument non-tty use', () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Agent mode: install rules \+ Skill \+ CLI/);
  assert.match(result.stdout, /No API key is needed for installation/);
  assert.match(result.stdout, /CLI mode: run a guided audit/);
});

test('mounts GatewayCheck into agent rules', () => {
  const root = resolve('.tmp-cli-init-test');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  try {
    const result = runCli(['init', '--cwd', root]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /agent rules installed/);
    const agents = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
    assert.match(agents, /gatewaycheck:agent-rule:start/);
    assert.match(agents, /--agent/);
    assert.match(agents, /stdout as compact JSON facts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('install mounts rules and skill without asking for gateway details', () => {
  const root = resolve('.tmp-cli-install-test');
  const codexHome = resolve(root, 'codex-home');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  try {
    const result = runCli(['install', '--cwd', root, '--force'], { CODEX_HOME: codexHome });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /agent rules installed/);
    assert.match(result.stdout, /Installed GatewayCheck skill/);
    assert.match(result.stdout, /Installation does not require an API key/);
    assert.doesNotMatch(result.stdout, /Gateway URL:/);
    const agents = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
    assert.match(agents, /GatewayCheck Agent Sensor/);
    const skill = readFileSync(resolve(codexHome, 'skills/gatewaycheck/SKILL.md'), 'utf8');
    assert.match(skill, /GatewayCheck/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: resolve('.'),
    encoding: 'utf8',
    env: {
      ...process.env,
      GATEWAYCHECK_TEST_MISSING_KEY: '',
      ...env,
    },
  });
}
