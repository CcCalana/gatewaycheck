#!/usr/bin/env node

import { homedir } from 'node:os';
import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildAuditMatrixConfig,
  createAgentError,
  createAgentFacts,
  discoverGateway,
  loadConfig,
  resolveApiKey,
  runAgentCompatibilitySuite,
  runAuditSuite,
  runCacheSuite,
  runMatrixSuite,
  runStreamSuite,
  sanitizeForLog,
  validateConfig,
} from '../../core/src/index.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATEWAYCHECK_RULE_START = '<!-- gatewaycheck:agent-rule:start -->';
const GATEWAYCHECK_RULE_END = '<!-- gatewaycheck:agent-rule:end -->';

const commands = {
  wizard,
  check: wizard,
  run: wizard,
  prompt: agentPrompt,
  'agent-prompt': agentPrompt,
  guide: agentPrompt,
  bootstrap: bootstrapPrompt,
  setup: wizard,
  install: installSkillAndGuide,
  init,
  discover,
  agent,
  cache,
  stream,
  matrix,
  audit,
  doctor,
  skill,
  help,
};

const rawCommand = process.argv[2];
const command = rawCommand ? commandFromArg(rawCommand) : 'wizard';
const args = command === 'wizard' && rawCommand && !commands[rawCommand] ? process.argv.slice(2) : process.argv.slice(3);

try {
  const handler = commands[command] ?? help;
  await handler(args);
} catch (error) {
  if (isAgentModeArgs(process.argv.slice(2))) {
    const payload = createAgentError(new Error(sanitizeForLog(error.message)));
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  console.error(`\nERROR: ${sanitizeForLog(error.message)}\n`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exit(1);
}

async function wizard(args) {
  if (args.includes('--help') || args.includes('-h')) {
    help();
    return;
  }

  rejectRawKeyFlags(args);
  if (!hasGatewayInput(args)) {
    await mainMenu(args);
    return;
  }
  await guidedAudit(args);
}

async function mainMenu(args) {
  if (!input.isTTY) {
    printWelcome();
    return;
  }

  printWelcome();
  const choice = (await askText('Choose an option [1-4] (1): ')).trim() || '1';
  if (choice === '1') {
    await installSkillAndGuide(args);
    return;
  }
  if (choice === '2') {
    bootstrapPrompt();
    return;
  }
  if (choice === '4') {
    help();
    return;
  }
  await guidedAudit(args);
}

function printWelcome() {
  console.log(`
GatewayCheck setup

Choose how you want to use GatewayCheck:

1. Agent mode: install rules + Skill + CLI (recommended)
2. Show the copy-paste instruction for your coding agent
3. CLI mode: run a guided audit in this terminal
4. Command reference

Run this inside Codex, Claude Code, Cursor, or another coding agent:
  npx gatewaycheck install

No API key is needed for installation. The agent asks for the gateway URL
and key environment variable later, when it is ready to audit.

CLI-only path:
  npx gatewaycheck https://api.example.com
`);
}

async function installSkillAndGuide(args = []) {
  if (!args.includes('--skill-only')) {
    await initAgentRules(args);
  }
  await skill(args.includes('--force') ? ['--install', '--force'] : ['--install']);
  printAgentNextSteps();
}

function bootstrapPrompt() {
  console.log([
    'Paste this into Codex, Claude Code, Cursor, or another coding agent:',
    '',
    '---',
    '',
    'Install GatewayCheck in this workspace and use it as an AI gateway sensor.',
    '',
    'Run:',
    'npx gatewaycheck install',
    '',
    'After installation, use the GatewayCheck rules/skill for any AI gateway connectivity, model routing, protocol compatibility, streaming, cache, usage, or billing diagnosis.',
    '',
    'When an audit is needed, ask me for the gateway URL and the API key environment variable name. Do not ask me to paste the raw API key into chat.',
    '',
    'Start with:',
    'npx gatewaycheck audit <gateway-url> --key-env <env-name> --preset smart --plan-only --agent',
    '',
    'Explain the planned request budget before running live probes with --yes.',
    '',
    '---',
  ].join('\n'));
}

async function guidedAudit(args) {
  const baseUrl = stringOption(args, '--base-url') ?? urlArgument(args) ?? await askText('Gateway URL: ');
  if (!baseUrl) throw new Error('gateway URL is required');

  const defaultKeyEnv = stringOption(args, '--key-env') ?? 'GATEWAY_API_KEY';
  const keyEnvAnswer = stringOption(args, '--key-env')
    ? defaultKeyEnv
    : await askText(`API key environment variable (${defaultKeyEnv}): `);
  const keyEnv = keyEnvAnswer || defaultKeyEnv;

  const presetAnswer = stringOption(args, '--preset') ?? await askText('Budget [quick/smart/broad] (smart): ');
  const preset = normalizePreset(presetAnswer || 'smart');
  const langAnswer = stringOption(args, '--lang') ?? await askText('Report language [auto/en/zh] (auto): ');
  const language = normalizeLanguage(langAnswer || 'auto');

  const config = buildInlineConfig([
    '--base-url', baseUrl,
    '--key-env', keyEnv,
    '--preset', preset,
    '--lang', language,
  ], baseUrl);

  const apiKey = await resolveApiKeyOrPrompt(config);

  const options = parseAuditOptions(['--preset', preset, '--lang', language]);
  output.write('\nPlanning a low-cost audit first...\n\n');
  const preview = await printAuditPlan(config, apiKey, options, ['--lang', language]);

  const maxRequests = preview.report.budget.maxRequests ?? 8;
  const plannedRequests = preview.report.budget.plannedMatrixRequests ?? 0;
  const proceed = await askText(`\nRun this audit now? It will use up to ${plannedRequests}/${maxRequests} matrix requests. [y/N]: `);
  if (!/^y(es)?$/i.test(proceed.trim())) {
    output.write('\nCancelled before running credit-consuming matrix probes.\n');
    return;
  }

  const { report, markdown } = await runAuditSuite(config, apiKey, {
    ...options,
    discovery: preview.discovery,
  });
  await printAuditAndMaybeSave(report, markdown, args);
}

async function agentPrompt(args) {
  rejectRawKeyFlags(args);
  const baseUrl = await promptValue(args, {
    flag: '--base-url',
    positional: true,
    question: 'Gateway URL for the agent prompt (leave blank for placeholder): ',
    fallback: '<gateway URL>',
  });
  const keyEnv = await promptValue(args, {
    flag: '--key-env',
    question: 'API key environment variable (GATEWAY_API_KEY): ',
    fallback: 'GATEWAY_API_KEY',
  });
  const preset = normalizePreset(await promptValue(args, {
    flag: '--preset',
    question: 'Budget preset [quick/smart/broad] (smart): ',
    fallback: 'smart',
  }));
  const lang = normalizeLanguage(await promptValue(args, {
    flag: '--lang',
    question: 'Report language [auto/en/zh] (auto): ',
    fallback: 'auto',
  }));
  const prompt = [
    'Copy this prompt into Codex, Claude Code, Cursor, or another coding agent:',
    '',
    '---',
    '',
    'Use GatewayCheck to audit this AI gateway.',
    '',
    `Gateway URL: ${baseUrl}`,
    `API key environment variable: ${keyEnv}`,
    `Preferred budget preset: ${preset}`,
    `Report language: ${lang}`,
    '',
    'Do not ask me to paste the API key into chat. If the environment variable is missing, run GatewayCheck and let it ask for the key securely in the terminal.',
    'If your shell is non-interactive and GatewayCheck cannot prompt for the key, ask me to set the environment variable locally before running live probes.',
    '',
    'Treat GatewayCheck as a sensor, not a reporter. Read its stdout as machine-readable JSON facts, then write the diagnosis yourself.',
    'Start with a plan-only audit. Keep the request budget low. Explain the selected models and protocols before running credit-consuming probes. After the run, summarize compatibility, permission issues, model routing signals, usage transparency, latency, and recommended next steps.',
    '',
    'Useful commands:',
    `npx gatewaycheck audit ${baseUrl} --key-env ${keyEnv} --preset ${preset} --plan-only --lang ${lang} --agent`,
    `npx gatewaycheck audit ${baseUrl} --key-env ${keyEnv} --preset ${preset} --yes --lang ${lang} --agent`,
    '',
    '---',
  ].join('\n');
  console.log(prompt);
}

async function init(args = []) {
  if (!args.includes('--config')) {
    await initAgentRules(args);
    return;
  }
  const source = resolve(packageRoot, 'configs/example.gateway.json');
  const target = resolve('gatewaycheck.local.json');
  await copyFile(source, target);
  console.log(`Created ${target}`);
  console.log('Set your API key in the environment variable named by apiKeyEnv before key-required suites.');
}

async function initAgentRules(args) {
  const root = resolve(stringOption(args, '--cwd') ?? '.');
  const explicitTargets = listOption(args, '--target');
  const targets = explicitTargets.length
    ? explicitTargets.map((target) => resolveInside(root, target))
    : await discoverAgentRuleTargets(root);
  const block = agentRuleBlock();
  const results = [];

  for (const target of targets) {
    const previous = await readTextIfExists(target);
    const next = upsertMarkedBlock(previous ?? '', block);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, next, { mode: 0o600 });
    results.push({
      file: target,
      action: previous === null ? 'created' : previous.includes(GATEWAYCHECK_RULE_START) ? 'updated' : 'appended',
    });
  }

  console.log('GatewayCheck agent rules installed:');
  for (const result of results) {
    console.log(`- ${result.action}: ${result.file}`);
  }
  console.log('');
  console.log('Agents should call GatewayCheck with --agent and treat stdout as JSON facts.');
}

async function discover(args) {
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  let apiKey = '';
  try {
    apiKey = resolveApiKey(config);
  } catch {
    // Discovery can run without key; /v1/models will be skipped.
  }
  const report = await discoverGateway(config, apiKey);
  await emitReport(report, args);
}

async function agent(args) {
  requireYes(args, 'agent compatibility suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runAgentCompatibilitySuite(config, apiKey);
  await emitReport(report, args);
}

async function cache(args) {
  requireYes(args, 'prompt cache suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runCacheSuite(config, apiKey);
  await emitReport(report, args);
}

async function stream(args) {
  requireYes(args, 'streaming performance suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runStreamSuite(config, apiKey);
  await emitReport(report, args);
}

async function matrix(args) {
  requireYes(args, 'model/protocol matrix suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runMatrixSuite(config, apiKey);
  await emitReport(report, args);
}

async function audit(args) {
  rejectRawKeyFlags(args);
  let config = await loadConfigFromArgs(args);
  const options = parseAuditOptions(args);
  if (args.includes('--plan-only')) {
    const apiKey = resolveOptionalApiKey(config);
    await printAuditPlan(config, apiKey, options, args);
    return;
  }

  const apiKey = await resolveApiKeyOrPrompt(config);
  if (args.includes('--interactive')) {
    const interactive = await planInteractiveAudit(config, apiKey, args, options);
    config = interactive.config;
    Object.assign(options, interactive.options);
  } else {
    requireYes(args, 'gateway audit suite');
  }
  const { report, markdown } = await runAuditSuite(config, apiKey, options);
  await printAuditAndMaybeSave(report, markdown, args);
}

function help() {
  console.log(`
GatewayCheck

Usage:
  gatewaycheck
  gatewaycheck https://api.example.com
  gatewaycheck check https://api.example.com
  gatewaycheck bootstrap
  gatewaycheck prompt https://api.example.com
  gatewaycheck install
  gatewaycheck init
  gatewaycheck init --config
  gatewaycheck audit https://api.example.com --yes
  gatewaycheck audit https://api.example.com --agent --plan-only
  gatewaycheck audit https://api.example.com --plan-only
  gatewaycheck discover [config-or-flags]
  gatewaycheck agent [config-or-flags] --yes
  gatewaycheck cache [config-or-flags] --yes
  gatewaycheck stream [config-or-flags] --yes
  gatewaycheck matrix [config-or-flags] --yes
  gatewaycheck audit [config-or-flags] --plan-only
  gatewaycheck skill
  gatewaycheck skill --install
  gatewaycheck doctor

Source checkout:
  npm run audit -- --base-url https://api.example.com --key-env GATEWAY_API_KEY --yes

Defaults:
  config path: gatewaycheck.local.json
  key source:  config.apiKeyEnv environment variable
  key env:     GATEWAY_API_KEY for URL-only commands

Options:
  --yes              Required for key-consuming suites
  --base-url <url>   Build a temporary config from a gateway URL
  --key-env <name>   Environment variable that contains the API key
  --name <name>      Gateway name for reports
  --model <id>       Default OpenAI-compatible model hint
  --openai-model <id> OpenAI-compatible model hint
  --claude-model <id> Anthropic-compatible model hint
  --gemini-model <id> Gemini-compatible model hint
  --protocols <list> Comma-separated matrix protocols
  --preset <name>    Audit budget preset: quick, smart, broad
  --interactive      Ask before choosing audit coverage
  --plan-only        Show audit plan without running matrix probes
  --agent            Print compact machine-readable JSON facts for agents
  --json-only        Alias for --agent
  --lang <name>      Report language: auto, en, zh
  --out <path>       Save JSON report
  --md <path>        Save Markdown audit report
  --json             Print JSON to stdout
  --config           With init, create gatewaycheck.local.json instead of agent rules
  --skill-only       With install, skip project agent-rule mounting
  --max-models <n>   Audit planner model limit
  --max-requests <n> Audit request budget for matrix phase
  --max-tokens <n>   Audit max output tokens
`);
}

async function skill(args) {
  const source = resolve(packageRoot, 'skills/gatewaycheck');
  const target = resolveCodexSkillTarget();
  if (args.includes('--install')) {
    if (await pathExists(target)) {
      if (!args.includes('--force')) {
        console.log(`GatewayCheck skill is already installed at ${target}`);
        console.log('Pass --force to replace it.');
        return;
      }
      await rm(target, { recursive: true, force: true });
    }
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
    console.log(`Installed GatewayCheck skill to ${target}`);
    console.log('Restart Codex or reload your TUI session so it can discover the skill.');
    return;
  }

  console.log(`
GatewayCheck Skill

Source:
  ${source}

Install for Codex:
  gatewaycheck skill --install

Install and replace an existing copy:
  gatewaycheck skill --install --force

After installation, restart Codex or reload your TUI session.
`);
}

function printAgentNextSteps() {
  console.log(`
Next steps for agent-led audits:

1. Restart or reload your agent session if it does not pick up new rules automatically.
2. Tell the agent:
   Use GatewayCheck to audit my AI gateway.
3. The agent should ask for the gateway URL and API key environment variable name when it starts the audit.

Installation does not require an API key.
`);
}

async function discoverAgentRuleTargets(root) {
  const candidates = [
    'AGENTS.md',
    'CLAUDE.md',
    '.cursorrules',
    '.cursor/rules/gatewaycheck.mdc',
    '.github/copilot-instructions.md',
  ].map((target) => resolveInside(root, target));
  const existing = [];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) existing.push(candidate);
  }
  return existing.length ? existing : [resolveInside(root, 'AGENTS.md')];
}

function agentRuleBlock() {
  return `${GATEWAYCHECK_RULE_START}
## GatewayCheck Agent Sensor

When diagnosing AI gateway connectivity, model routing, protocol compatibility, streaming, prompt-cache behavior, token usage, or billing transparency, use GatewayCheck as a machine-readable sensor.

- Prefer: \`npx gatewaycheck audit <gateway-url> --key-env GATEWAY_API_KEY --preset smart --plan-only --agent\`
- After explaining the request budget, run live probes with: \`npx gatewaycheck audit <gateway-url> --key-env GATEWAY_API_KEY --preset smart --yes --agent\`
- Treat stdout as compact JSON facts. Do not rely on GatewayCheck to write the final human report.
- Do not ask the user to paste raw API keys into chat. If the environment variable is missing, ask them to set it locally or run the guided CLI flow.
- Use \`quick\` or \`smart\` first. Use \`broad\` only after the user asks for wider coverage.
${GATEWAYCHECK_RULE_END}
`;
}

function upsertMarkedBlock(content, block) {
  if (!content) return block;
  const start = content.indexOf(GATEWAYCHECK_RULE_START);
  const end = content.indexOf(GATEWAYCHECK_RULE_END);
  if (start >= 0 && end >= start) {
    return `${content.slice(0, start)}${block}${content.slice(end + GATEWAYCHECK_RULE_END.length).replace(/^\s*\n?/, '')}`;
  }
  return `${content.replace(/\s*$/, '')}\n\n${block}`;
}

async function doctor() {
  const checks = [];
  const packageJson = await readJsonIfExists('package.json');
  const gitignore = await readTextIfExists('.gitignore');

  checks.push(check(
    Number(process.versions.node.split('.')[0]) >= 20,
    `Node.js ${process.versions.node}`,
    'Node.js 20+ is required'
  ));
  checks.push(check(packageJson?.name === 'gatewaycheck', 'package name is gatewaycheck', 'package name should be gatewaycheck'));
  checks.push(check(packageJson?.license === 'MIT', 'package license is MIT', 'package license should be MIT'));
  checks.push(check(packageJson?.publishConfig?.access === 'public', 'npm publish access is public', 'publishConfig.access should be public'));
  checks.push(check(
    packageJson?.bin?.gatewaycheck === 'packages/cli/bin/gatewaycheck.mjs',
    'gatewaycheck bin is configured',
    'gatewaycheck bin is missing'
  ));
  checks.push(check(packageJson?.engines?.node === '>=20.0.0', 'Node engine is >=20.0.0', 'Node engine should be >=20.0.0'));
  checks.push(check(Boolean(packageJson?.scripts?.test), 'npm test script exists', 'npm test script is missing'));
  checks.push(check(
    Boolean(packageJson?.scripts?.['pack:dry-run']),
    'npm pack dry-run script exists',
    'npm pack dry-run script is missing'
  ));
  checks.push(warn(
    Boolean(packageJson?.repository?.url),
    'package repository URL is set',
    'package repository URL is not set yet; add it after choosing the GitHub repo'
  ));
  checks.push(warn(
    Boolean(packageJson?.bugs?.url || packageJson?.homepage),
    'package issue/homepage metadata is set',
    'package issue/homepage metadata is not set yet; add it after choosing the GitHub repo'
  ));
  checks.push(warn(
    await pathExists('.git'),
    'local git repository is initialized',
    'local folder is not a git repository yet; initialize it or clone the target repo before pushing'
  ));

  const requiredFiles = [
    'README.md',
    'README.zh-CN.md',
    'LICENSE',
    'configs/example.gateway.json',
    'examples/example.gateway.json',
    'examples/redacted-audit.md',
    'skills/gatewaycheck/SKILL.md',
    '.github/workflows/ci.yml',
  ];
  for (const file of requiredFiles) {
    checks.push(check(await pathExists(file), `${file} exists`, `${file} is missing`));
  }

  const packageFiles = packageJson?.files ?? [];
  for (const entry of [
    'packages/core/src',
    'packages/cli/bin',
    'configs',
    'docs',
    'examples',
    'skills',
    'LICENSE',
    'README.md',
    'README.zh-CN.md',
  ]) {
    checks.push(check(packageFiles.includes(entry), `package includes ${entry}`, `package files should include ${entry}`));
  }

  for (const pattern of ['.env', '*.local', 'gatewaycheck.local.json', 'reports/', '.npm-cache/']) {
    checks.push(check(gitignore.includes(pattern), `.gitignore protects ${pattern}`, `.gitignore should protect ${pattern}`));
  }

  const failed = checks.filter((item) => item.status === 'fail');
  const warned = checks.filter((item) => item.status === 'warn');
  for (const item of checks) {
    const icon = item.status === 'pass' ? 'PASS' : item.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${icon} ${item.message}`);
  }
  console.log('');
  console.log(
    failed.length
      ? `Doctor found ${failed.length} release readiness issue(s).`
      : warned.length
        ? `Doctor found ${warned.length} release readiness warning(s), with no blocking issues.`
        : 'Doctor found no release readiness issues.'
  );
  if (failed.length) process.exitCode = 1;
}

async function loadConfigFromArgs(args) {
  const baseUrl = stringOption(args, '--base-url') ?? urlArgument(args);
  if (baseUrl) {
    const config = buildInlineConfig(args, baseUrl);
    validateConfig(config);
    return Object.freeze(config);
  }
  const configPath = firstNonFlag(args) ?? 'gatewaycheck.local.json';
  return loadConfig(resolve(configPath));
}

function firstNonFlag(args) {
  const valueFlags = new Set([
    '--out',
    '--md',
    '--max-models',
    '--max-requests',
    '--max-tokens',
    '--base-url',
    '--key-env',
    '--name',
    '--model',
    '--openai-model',
    '--claude-model',
    '--gemini-model',
    '--protocols',
    '--preset',
    '--lang',
    '--timeout-ms',
    '--target',
    '--cwd',
  ]);
  return args.find((arg, idx) => !arg.startsWith('--') && !valueFlags.has(args[idx - 1]) && !isUrlLike(arg));
}

function buildInlineConfig(args, baseUrl) {
  const models = {};
  const defaultModel = stringOption(args, '--model');
  const openaiModel = stringOption(args, '--openai-model') ?? defaultModel;
  const claudeModel = stringOption(args, '--claude-model');
  const geminiModel = stringOption(args, '--gemini-model');
  if (defaultModel) models.cheap = defaultModel;
  if (openaiModel) models.openai = openaiModel;
  if (claudeModel) models.claude = claudeModel;
  if (geminiModel) models.gemini = geminiModel;

  const protocols = listOption(args, '--protocols');
  return {
    name: stringOption(args, '--name') ?? hostName(baseUrl),
    baseUrl,
    apiKeyEnv: stringOption(args, '--key-env') ?? 'GATEWAY_API_KEY',
    language: stringOption(args, '--lang'),
    models,
    requestBudget: {
      maxRequests: numberOption(args, '--max-requests') ?? undefined,
      maxOutputTokens: numberOption(args, '--max-tokens') ?? undefined,
      timeoutMs: numberOption(args, '--timeout-ms') ?? 90000,
    },
    matrix: protocols.length ? { protocols } : undefined,
  };
}

function requireYes(args, suite) {
  if (!args.includes('--yes') && process.env.GATEWAYCHECK_YES !== '1' && process.env.GATEWAY_BENCHMARK_YES !== '1') {
    throw new Error(`${suite} uses API credits; pass --yes after reviewing the request budget`);
  }
}

function rejectRawKeyFlags(args) {
  if (args.some((arg) => arg === '--api-key' || arg === '--key' || arg.startsWith('--api-key=') || arg.startsWith('--key='))) {
    throw new Error('do not pass raw API keys as CLI flags; set an environment variable and pass --key-env instead');
  }
}

async function resolveApiKeyOrPrompt(config) {
  try {
    return resolveApiKey(config);
  } catch (error) {
    const message = String(error?.message ?? '');
    if (!message.includes('missing API key environment variable')) throw error;
    return promptForApiKey(config.apiKeyEnv ?? 'GATEWAY_API_KEY');
  }
}

function resolveOptionalApiKey(config) {
  try {
    return resolveApiKey(config);
  } catch {
    return '';
  }
}

async function printAuditPlan(config, apiKey, options, args) {
  const discovery = await discoverGateway(config, apiKey);
  const { config: matrixConfig, plan } = buildAuditMatrixConfig(config, discovery, options);
  const plannedRequests = plan.reduce((sum, item) => sum + item.protocols.length, 0);
  const report = Object.freeze({
    schemaVersion: '0.2',
    suite: 'audit-plan',
    gateway: {
      name: config.name ?? 'Unnamed Gateway',
      baseUrl: config.baseUrl,
      family: discovery.gateway?.family ?? 'unknown',
    },
    generatedAt: new Date().toISOString(),
    requestCount: discovery.requestCount ?? 0,
    discoverySummary: {
      visibleModels: discovery.modelSummary?.count ?? 0,
      pricingCatalogModels: discovery.pricingSummary?.modelCount ?? 0,
    },
    budget: {
      maxModels: options.maxModels,
      maxRequests: matrixConfig.requestBudget?.maxRequests,
      maxOutputTokens: matrixConfig.requestBudget?.maxOutputTokens,
      plannedMatrixRequests: plannedRequests,
    },
    auditPlan: plan,
  });

  if (isAgentMode(args)) {
    await emitAgentReport(report, args);
    return { report, discovery, matrixConfig, plan };
  }
  if (args.includes('--json')) {
    await printAndMaybeSave(report, args);
    return { report, discovery, matrixConfig, plan };
  }

  console.log(renderAuditPlanSummary(report, resolveCliLanguage(config, args)));
  await printAndMaybeSave(report, args, { printDefault: false });
  return { report, discovery, matrixConfig, plan };
}

function renderAuditPlanSummary(report, lang) {
  const plan = report.auditPlan ?? [];
  if (lang === 'zh') {
    const lines = [
      '# GatewayCheck 审计计划预览',
      '',
      `网关: ${report.gateway.name} (${report.gateway.baseUrl})`,
      `Discovery 请求数: ${report.requestCount}`,
      `可见模型数: ${report.discoverySummary.visibleModels}`,
      `价格目录模型数: ${report.discoverySummary.pricingCatalogModels}`,
      `计划矩阵请求数: ${report.budget.plannedMatrixRequests}/${report.budget.maxRequests ?? '未限制'}`,
      `单次探针最大输出 token: ${report.budget.maxOutputTokens ?? '未限制'}`,
      '',
      '## 计划测试项',
      '',
    ];
    if (!plan.length) {
      lines.push('未选出模型。请提供 --model/--openai-model，或确认该网关的 /v1/models 与 /api/pricing 可访问。');
    } else {
      for (const item of plan) {
        lines.push(`- ${item.id}: ${item.protocols.join(', ')} (${item.label})`);
      }
    }
    lines.push('');
    lines.push('这是预览模式，没有执行矩阵探针。确认后再追加 --yes 运行正式 audit。');
    return lines.join('\n');
  }

  const lines = [
    '# GatewayCheck Audit Plan Preview',
    '',
    `Gateway: ${report.gateway.name} (${report.gateway.baseUrl})`,
    `Discovery requests used: ${report.requestCount}`,
    `Visible models: ${report.discoverySummary.visibleModels}`,
    `Pricing catalog models: ${report.discoverySummary.pricingCatalogModels}`,
    `Planned matrix requests: ${report.budget.plannedMatrixRequests}/${report.budget.maxRequests ?? 'unlimited'}`,
    `Max output tokens per probe: ${report.budget.maxOutputTokens ?? 'unlimited'}`,
    '',
    '## Planned Checks',
    '',
  ];
  if (!plan.length) {
    lines.push('No models were selected. Provide --model/--openai-model, or confirm the gateway exposes /v1/models or /api/pricing.');
  } else {
    for (const item of plan) {
      lines.push(`- ${item.id}: ${item.protocols.join(', ')} (${item.label})`);
    }
  }
  lines.push('');
  lines.push('Preview mode did not run matrix probes. Add --yes when you are ready to run the audit.');
  return lines.join('\n');
}

async function printAndMaybeSave(report, args, options = {}) {
  const printDefault = options.printDefault ?? true;
  const json = JSON.stringify(report, null, 2);
  const outIdx = args.indexOf('--out');
  if (args.includes('--json') || (outIdx < 0 && printDefault)) {
    console.log(json);
  }
  if (outIdx >= 0 && args[outIdx + 1]) {
    const outPath = resolve(args[outIdx + 1]);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, { mode: 0o600 });
    console.error(`Saved report to ${outPath}`);
  }
}

async function printAuditAndMaybeSave(report, markdown, args) {
  if (isAgentMode(args)) {
    await emitAgentReport(report, args);
    return;
  }
  const mdIdx = args.indexOf('--md');
  if (mdIdx >= 0 && args[mdIdx + 1]) {
    const mdPath = resolve(args[mdIdx + 1]);
    await mkdir(dirname(mdPath), { recursive: true });
    await writeFile(mdPath, markdown, { mode: 0o600 });
    console.error(`Saved Markdown report to ${mdPath}`);
  } else {
    console.log(markdown);
  }
  await printAndMaybeSave(report, args, { printDefault: false });
}

async function emitReport(report, args) {
  if (isAgentMode(args)) {
    await emitAgentReport(report, args);
    return;
  }
  await printAndMaybeSave(report, args);
}

async function emitAgentReport(report, args) {
  const payload = createAgentFacts(report);
  const json = JSON.stringify(payload, null, 2);
  console.log(json);
  await saveJsonIfRequested(json, args);
  process.exitCode = payload.exitCode;
}

async function saveJsonIfRequested(json, args) {
  const outIdx = args.indexOf('--out');
  if (outIdx >= 0 && args[outIdx + 1]) {
    const outPath = resolve(args[outIdx + 1]);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json, { mode: 0o600 });
  }
}

function parseAuditOptions(args) {
  const preset = auditPreset(args);
  return {
    maxModels: numberOption(args, '--max-models') ?? preset.maxModels,
    maxRequests: numberOption(args, '--max-requests') ?? preset.maxRequests,
    maxOutputTokens: numberOption(args, '--max-tokens') ?? preset.maxOutputTokens,
    language: stringOption(args, '--lang'),
  };
}

async function planInteractiveAudit(config, apiKey, args, options) {
  const rl = createInterface({ input, output });
  try {
    const discovery = await discoverGateway(config, apiKey);
    const visible = discovery.modelSummary?.count ?? 0;
    const pricing = discovery.pricingSummary?.modelCount ?? 0;
    output.write(`Discovery complete: visible models=${visible}, pricing catalog models=${pricing}.\n`);
    const { coverage: defaultCoverage, reason } = recommendCoverage(visible, pricing);
    output.write(`Recommended coverage: ${defaultCoverage} (${reason}).\n`);
    const coverage = normalizeCoverage(await ask(rl, `Coverage [quick/smart/broad/specified] (${defaultCoverage}): `), defaultCoverage);
    const reportLang = normalizeLanguage(
      stringOption(args, '--lang') ?? await ask(rl, 'Report language [auto/en/zh] (auto): ')
    );
    const nextOptions = { ...options, discovery, ...presetForCoverage(coverage) };
    nextOptions.language = reportLang;
    let nextConfig = config;
    if (coverage === 'specified') {
      const models = splitList(await ask(rl, 'Model ids, comma-separated: '));
      if (!models.length) throw new Error('interactive specified coverage requires at least one model id');
      const protocols = splitList(await ask(rl, 'Protocols, comma-separated (openai-chat): '));
      const selectedProtocols = protocols.length ? protocols : ['openai-chat'];
      nextConfig = {
        ...config,
        matrix: {
          models: models.map((id) => ({ id, protocols: selectedProtocols })),
        },
      };
      nextOptions.maxModels = models.length;
      nextOptions.maxRequests = Math.min(
        numberOption(args, '--max-requests') ?? models.length * selectedProtocols.length,
        64
      );
    }
    const maxRequests = nextOptions.maxRequests ?? 8;
    const maxTokens = nextOptions.maxOutputTokens ?? 64;
    const proceed = await ask(rl, `Run audit with up to ${maxRequests} matrix requests and max ${maxTokens} output tokens? [y/N]: `);
    if (!/^y(es)?$/i.test(proceed.trim())) throw new Error('interactive audit cancelled');
    return { config: nextConfig, options: nextOptions };
  } finally {
    rl.close();
  }
}

function recommendCoverage(visible, pricing) {
  if (visible > 30 && pricing > 0) {
    return {
      coverage: 'smart',
      reason: 'many visible models; sample low-cost representatives first',
    };
  }
  if (visible > 10 || pricing === 0) {
    return {
      coverage: 'smart',
      reason: pricing === 0 ? 'pricing is unavailable; avoid broad spend until the plan is clear' : 'model list is large',
    };
  }
  return {
    coverage: 'quick',
    reason: 'small visible model set; start with the cheapest sanity check',
  };
}

function commandFromArg(arg) {
  if (isUrlLike(arg)) return 'wizard';
  return arg;
}

function isAgentMode(args) {
  return isAgentModeArgs(args);
}

function isAgentModeArgs(args) {
  return args.includes('--agent') || args.includes('--json-only');
}

function hasGatewayInput(args) {
  return Boolean(stringOption(args, '--base-url') || urlArgument(args));
}

async function ask(rl, question) {
  return (await rl.question(question)).trim();
}

async function askText(question) {
  if (!input.isTTY) throw new Error('interactive input is required; pass --base-url and set the API key environment variable for non-interactive use');
  const rl = createInterface({ input, output });
  try {
    return await ask(rl, question);
  } finally {
    rl.close();
  }
}

async function promptValue(args, { flag, positional = false, question, fallback }) {
  const explicit = stringOption(args, flag);
  if (explicit) return explicit;
  const positionalValue = positional ? urlArgument(args) : undefined;
  if (positionalValue) return positionalValue;
  if (!input.isTTY) return fallback;
  const answer = (await askText(question)).trim();
  return answer || fallback;
}

async function promptForApiKey(keyEnv) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error(`${missingKeyMessage(keyEnv)}\n\nSet it before running GatewayCheck:\n  PowerShell: $env:${keyEnv}="sk-..."\n  macOS/Linux: export ${keyEnv}="sk-..."`);
  }

  output.write(`\n${keyEnv} is not set. Paste the API key for this run only.\n`);
  output.write('GatewayCheck will not save it to a config file or print it in the report.\n');
  const key = await readSecret('API key: ');
  if (!key) throw new Error(missingKeyMessage(keyEnv));
  return key;
}

function readSecret(question) {
  return new Promise((resolveSecret, rejectSecret) => {
    let secret = '';
    let done = false;
    const wasRaw = input.isRaw;

    function cleanup() {
      input.off('data', onData);
      if (typeof input.setRawMode === 'function') input.setRawMode(Boolean(wasRaw));
      input.pause();
    }

    function finish() {
      if (done) return;
      done = true;
      cleanup();
      output.write('\n');
      resolveSecret(secret.trim());
    }

    function fail(error) {
      if (done) return;
      done = true;
      cleanup();
      rejectSecret(error);
    }

    function onData(buffer) {
      const text = buffer.toString('utf8');
      for (const char of text) {
        if (char === '\u0003') {
          fail(new Error('cancelled'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u0008' || char === '\u007f') {
          secret = secret.slice(0, -1);
          continue;
        }
        secret += char;
      }
    }

    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

function missingKeyMessage(keyEnv) {
  return `missing API key environment variable: ${keyEnv}`;
}

function normalizeCoverage(value, fallback) {
  const text = String(value || fallback).trim().toLowerCase();
  if (['quick', 'smart', 'broad', 'specified'].includes(text)) return text;
  return fallback;
}

function normalizeLanguage(value) {
  const text = String(value || 'auto').trim().toLowerCase();
  if (['auto', 'en', 'zh'].includes(text)) return text;
  return 'auto';
}

function normalizePreset(value) {
  const text = String(value || 'smart').trim().toLowerCase();
  if (['quick', 'smart', 'broad'].includes(text)) return text;
  return 'smart';
}

function resolveCliLanguage(config, args) {
  const lang = normalizeLanguage(stringOption(args, '--lang') ?? config.language);
  if (lang === 'zh') return 'zh';
  return 'en';
}

function presetForCoverage(coverage) {
  if (coverage === 'quick') return { maxModels: 1, maxRequests: 4, maxOutputTokens: 32 };
  if (coverage === 'broad') return { maxModels: 6, maxRequests: 18, maxOutputTokens: 96 };
  if (coverage === 'specified') return { maxOutputTokens: 64 };
  return { maxModels: 3, maxRequests: 8, maxOutputTokens: 64 };
}

function auditPreset(args) {
  const preset = normalizePreset(stringOption(args, '--preset') ?? 'smart');
  if (preset === 'quick') {
    return { maxModels: 1, maxRequests: 4, maxOutputTokens: 32 };
  }
  if (preset === 'broad') {
    return { maxModels: 6, maxRequests: 18, maxOutputTokens: 96 };
  }
  return { maxModels: 3, maxRequests: 8, maxOutputTokens: 64 };
}

function stringOption(args, flag) {
  const idx = args.indexOf(flag);
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  if (idx < 0 || !args[idx + 1]) return undefined;
  return args[idx + 1];
}

function listOption(args, flag) {
  return splitList(stringOption(args, flag) ?? '');
}

function urlArgument(args) {
  return args.find((arg, idx) => isUrlLike(arg) && !args[idx - 1]?.startsWith('--'));
}

function isUrlLike(value) {
  return /^https:\/\/[^ ]+/i.test(String(value ?? ''));
}

function resolveInside(root, target) {
  const rootPath = resolve(root);
  const targetPath = resolve(rootPath, target);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}\\`) && !targetPath.startsWith(`${rootPath}/`)) {
    throw new Error(`refusing to write outside project root: ${target}`);
  }
  return targetPath;
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOption(args, flag) {
  const idx = args.indexOf(flag);
  const value = stringOption(args, flag);
  if (idx < 0 && value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function hostName(baseUrl) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return 'Gateway';
  }
}

function resolveCodexSkillTarget() {
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  return resolve(codexHome, 'skills/gatewaycheck');
}

async function pathExists(path) {
  try {
    await access(resolve(path));
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch {
    return null;
  }
}

async function readTextIfExists(path) {
  try {
    return await readFile(resolve(path), 'utf8');
  } catch {
    return '';
  }
}

function check(condition, passMessage, failMessage) {
  return Object.freeze({
    status: condition ? 'pass' : 'fail',
    message: condition ? passMessage : failMessage,
  });
}

function warn(condition, passMessage, warningMessage) {
  return Object.freeze({
    status: condition ? 'pass' : 'warn',
    message: condition ? passMessage : warningMessage,
  });
}
