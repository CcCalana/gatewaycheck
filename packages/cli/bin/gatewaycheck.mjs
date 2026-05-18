#!/usr/bin/env node

import { homedir } from 'node:os';
import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildAuditMatrixConfig,
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

const commands = {
  wizard,
  check: wizard,
  run: wizard,
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

async function init() {
  const source = resolve(packageRoot, 'configs/example.gateway.json');
  const target = resolve('gatewaycheck.local.json');
  await copyFile(source, target);
  console.log(`Created ${target}`);
  console.log('Set your API key in the environment variable named by apiKeyEnv before key-required suites.');
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
  await printAndMaybeSave(report, args);
}

async function agent(args) {
  requireYes(args, 'agent compatibility suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runAgentCompatibilitySuite(config, apiKey);
  await printAndMaybeSave(report, args);
}

async function cache(args) {
  requireYes(args, 'prompt cache suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runCacheSuite(config, apiKey);
  await printAndMaybeSave(report, args);
}

async function stream(args) {
  requireYes(args, 'streaming performance suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runStreamSuite(config, apiKey);
  await printAndMaybeSave(report, args);
}

async function matrix(args) {
  requireYes(args, 'model/protocol matrix suite');
  rejectRawKeyFlags(args);
  const config = await loadConfigFromArgs(args);
  const apiKey = await resolveApiKeyOrPrompt(config);
  const report = await runMatrixSuite(config, apiKey);
  await printAndMaybeSave(report, args);
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
  gatewaycheck audit https://api.example.com --yes
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
  gatewaycheck init

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
  --lang <name>      Report language: auto, en, zh
  --out <path>       Save JSON report
  --md <path>        Save Markdown audit report
  --json             Print JSON to stdout
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
        throw new Error(`GatewayCheck skill already exists at ${target}; pass --force to replace it`);
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

function printMissingKeyHelp(keyEnv) {
  console.error(`\nMissing API key environment variable: ${keyEnv}\n`);
  console.error('Set it in your shell, then run the command again.');
  console.error('');
  console.error('Windows PowerShell:');
  console.error(`  $env:${keyEnv}="sk-..."`);
  console.error('');
  console.error('macOS / Linux:');
  console.error(`  export ${keyEnv}="sk-..."`);
  console.error('');
  console.error('GatewayCheck does not accept raw API keys as CLI flags.');
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
  return Number.isFinite(n) ? n : undefined;
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
