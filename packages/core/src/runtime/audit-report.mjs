const DICT = Object.freeze({
  en: Object.freeze({
    title: 'GatewayCheck Audit Report',
    gateway: 'Gateway',
    generated: 'Generated',
    executiveSummary: 'Executive Summary',
    health: 'Health',
    requestCount: 'Requests used',
    discoveryFamily: 'Discovery family',
    visibleModels: 'Visible models',
    pricingCatalogModels: 'Pricing catalog models',
    matrixPassFail: 'Matrix pass/fail',
    protocolsTested: 'Protocols tested',
    findings: 'Findings',
    recommendedActions: 'Recommended Actions',
    modelProtocolMatrix: 'Model / Protocol Matrix',
    model: 'Model',
    protocol: 'Protocol',
    status: 'Status',
    http: 'HTTP',
    latency: 'Latency',
    usage: 'Usage',
    notes: 'Notes',
    byProtocol: 'By Protocol',
    pass: 'Pass',
    fail: 'Fail',
    skip: 'Skip',
    avgLatency: 'Avg Latency',
    selectedPlan: 'Selected Plan',
    noVisibleModels: 'No models were visible through /v1/models; matrix planning may rely on pricing hints only.',
    noPricing: 'No public pricing catalog was discovered; cost ranking is unavailable, so audit selection used visible and configured model candidates.',
    claudeCliOnly: '{model} is restricted to the official Claude CLI, so generic Anthropic API probes should be treated as unsupported for this token/group.',
    tokenBudget: '{model} on {protocol} may need a wider output budget because the probe produced no visible content before the token limit.',
    accessDenied: '{model} on {protocol} returned access denied; check token group permissions.',
    genericFail: '{model} on {protocol} failed: {error}',
    resolvedModel: '{model} on {protocol} resolved to {resolvedModel}; treat this as a gateway model alias or routing signal.',
    reasoningTokens: '{model} on {protocol} used {reasoning}/{completion} completion tokens as reasoning tokens.',
    actionNoPricing: 'No pricing catalog was found. Prefer explicit model hints or specified coverage if cost control matters.',
    actionFailures: 'Review failed protocols and key-group permissions before using this gateway for agents or production traffic.',
    actionResolvedModels: 'Model aliasing was detected. Confirm whether routed upstream models match your expectations.',
    actionReasoningBudget: 'Reasoning-token-heavy models may need a larger --max-tokens value for a fair compatibility check.',
    healthPass: 'pass',
    healthPartial: 'partial',
    healthBlocked: 'blocked',
    healthUnknown: 'unknown',
    healthPassDetail: 'Core checked probes passed in this bounded audit.',
    healthPartialDetail: 'Some probes passed and some failed; review protocol or key-group findings.',
    healthBlockedDetail: 'No checked protocol passed; verify base URL, key, model names, and group permissions.',
    healthUnknownDetail: 'No matrix probes were completed.',
  }),
  zh: Object.freeze({
    title: 'GatewayCheck 审计报告',
    gateway: '网关',
    generated: '生成时间',
    executiveSummary: '执行摘要',
    health: '健康状态',
    requestCount: '已用请求数',
    discoveryFamily: 'Discovery 类型',
    visibleModels: '可见模型数',
    pricingCatalogModels: '价格目录模型数',
    matrixPassFail: '矩阵通过/失败',
    protocolsTested: '已测试协议',
    findings: '发现',
    recommendedActions: '建议动作',
    modelProtocolMatrix: '模型 / 协议矩阵',
    model: '模型',
    protocol: '协议',
    status: '状态',
    http: 'HTTP',
    latency: '延迟',
    usage: '用量',
    notes: '备注',
    byProtocol: '按协议汇总',
    pass: '通过',
    fail: '失败',
    skip: '跳过',
    avgLatency: '平均延迟',
    selectedPlan: '已选测试计划',
    noVisibleModels: '未能通过 /v1/models 看到模型；矩阵规划可能只能依赖价格或配置线索。',
    noPricing: '未发现公开价格目录；无法进行真实成本排序，本轮使用可见模型和配置候选进行抽样。',
    claudeCliOnly: '{model} 受限于官方 Claude CLI；普通 Anthropic API 探针应视为当前 token/分组不支持。',
    tokenBudget: '{model} 在 {protocol} 下可能需要更大的输出预算，因为探针在 token 上限前没有产生可见内容。',
    accessDenied: '{model} 在 {protocol} 下返回 access denied；请检查 token 分组权限。',
    genericFail: '{model} 在 {protocol} 下失败：{error}',
    resolvedModel: '{model} 在 {protocol} 下实际解析为 {resolvedModel}；这通常是网关模型别名或路由信号。',
    reasoningTokens: '{model} 在 {protocol} 下将 {reasoning}/{completion} 个 completion tokens 用作 reasoning tokens。',
    actionNoPricing: '未发现价格目录。如果你关心成本控制，建议使用显式模型 hint 或指定模型覆盖范围。',
    actionFailures: '在把该网关用于 agent 或生产流量前，请先检查失败协议和 key 分组权限。',
    actionResolvedModels: '检测到模型别名或路由。请确认实际上游模型是否符合预期。',
    actionReasoningBudget: 'reasoning token 占比较高的模型可能需要更大的 --max-tokens 才能公平判断兼容性。',
    healthPass: '通过',
    healthPartial: '部分可用',
    healthBlocked: '阻塞',
    healthUnknown: '未知',
    healthPassDetail: '本次有界审计中的核心探针均通过。',
    healthPartialDetail: '部分探针通过、部分失败；请重点查看协议或 key 分组相关发现。',
    healthBlockedDetail: '没有任何被测协议通过；请检查 base URL、key、模型名和分组权限。',
    healthUnknownDetail: '没有完成矩阵探针。',
  }),
});

export function renderAuditMarkdown(report, options = {}) {
  const lang = resolveReportLanguage(options.language ?? report.language);
  const t = DICT[lang];
  const lines = [];
  const discovery = report.discovery;
  const matrix = report.matrix;
  const findings = report.analysis?.findings ?? [];
  const health = report.analysis?.health ?? healthSummary(matrix);

  lines.push(`# ${t.title}`);
  lines.push('');
  lines.push(`${t.gateway}: ${report.gateway.name} (${report.gateway.baseUrl})`);
  lines.push(`${t.generated}: ${report.generatedAt}`);
  lines.push('');

  lines.push(`## ${t.executiveSummary}`);
  lines.push('');
  lines.push(`- ${t.health}: ${formatHealth(health, lang)} - ${health.detail ?? ''}`);
  lines.push(`- ${t.requestCount}: ${report.requestCount ?? 0}`);
  lines.push(`- ${t.discoveryFamily}: ${discovery?.gateway?.family ?? 'unknown'}`);
  lines.push(`- ${t.visibleModels}: ${discovery?.modelSummary?.count ?? 0}`);
  lines.push(`- ${t.pricingCatalogModels}: ${discovery?.pricingSummary?.modelCount ?? 0}`);
  lines.push(`- ${t.matrixPassFail}: ${matrix?.summary?.passCount ?? 0}/${matrix?.summary?.failCount ?? 0}`);
  lines.push(`- ${t.protocolsTested}: ${(matrix?.summary?.protocols ?? []).join(', ') || 'none'}`);
  lines.push('');

  if (findings.length) {
    lines.push(`## ${t.findings}`);
    lines.push('');
    for (const finding of findings) {
      lines.push(`- [${finding.severity}] ${finding.message}`);
    }
    lines.push('');
  }

  const recommendations = report.analysis?.recommendations ?? [];
  if (recommendations.length) {
    lines.push(`## ${t.recommendedActions}`);
    lines.push('');
    for (const recommendation of recommendations) {
      lines.push(`- ${recommendation}`);
    }
    lines.push('');
  }

  lines.push(`## ${t.modelProtocolMatrix}`);
  lines.push('');
  lines.push(`| ${t.model} | ${t.protocol} | ${t.status} | ${t.http} | ${t.latency} | ${t.usage} | ${t.notes} |`);
  lines.push(`|---|---|---:|---:|---:|---:|---|`);
  for (const result of matrix?.results ?? []) {
    const modelLabel = result.resolvedModel ? `${result.model} -> ${result.resolvedModel}` : result.model;
    lines.push(`| ${escapeCell(modelLabel)} | ${escapeCell(result.protocol)} | ${localStatus(result.status, lang)} | ${result.httpStatus} | ${formatMs(result.latencyMs)} | ${formatUsage(result.usage)} | ${escapeCell(noteForResult(result))} |`);
  }
  lines.push('');

  lines.push(`## ${t.byProtocol}`);
  lines.push('');
  lines.push(`| ${t.protocol} | ${t.pass} | ${t.fail} | ${t.skip} | ${t.avgLatency} |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  for (const [protocol, summary] of Object.entries(matrix?.summary?.byProtocol ?? {})) {
    lines.push(`| ${escapeCell(protocol)} | ${summary.pass} | ${summary.fail} | ${summary.skip} | ${formatMs(summary.avgLatencyMs)} |`);
  }
  lines.push('');

  lines.push(`## ${t.selectedPlan}`);
  lines.push('');
  for (const item of report.auditPlan ?? []) {
    lines.push(`- ${item.id}: ${(item.protocols ?? []).join(', ')} (${item.label})`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export function analyzeAudit(discoveryReport, matrixReport, options = {}) {
  const language = resolveReportLanguage(options.language);
  const t = DICT[language];
  const findings = [];
  const visibleCount = discoveryReport?.modelSummary?.count ?? 0;
  if (visibleCount === 0) {
    findings.push(finding('warn', t.noVisibleModels));
  }
  const pricingCount = discoveryReport?.pricingSummary?.modelCount ?? 0;
  if (pricingCount === 0) {
    findings.push(finding('info', t.noPricing));
  }

  for (const result of matrixReport?.results ?? []) {
    if (result.status !== 'fail') continue;
    const error = String(result.error ?? '');
    if (/official Claude CLI/i.test(error)) {
      findings.push(finding('info', template(t.claudeCliOnly, { model: result.model })));
    } else if (/max tokens|no visible content|finish.*length/i.test(error)) {
      findings.push(finding('warn', template(t.tokenBudget, { model: result.model, protocol: result.protocol })));
    } else if (/access_denied|访问被拒绝/i.test(error)) {
      findings.push(finding('warn', template(t.accessDenied, { model: result.model, protocol: result.protocol })));
    } else {
      findings.push(finding('warn', template(t.genericFail, {
        model: result.model,
        protocol: result.protocol,
        error: truncate(error, 140),
      })));
    }
  }

  for (const result of matrixReport?.results ?? []) {
    if (result.resolvedModel && result.resolvedModel !== result.model) {
      findings.push(finding('info', template(t.resolvedModel, {
        model: result.model,
        protocol: result.protocol,
        resolvedModel: result.resolvedModel,
      })));
    }
  }

  for (const result of matrixReport?.results ?? []) {
    const reasoning = result.usage?.reasoningTokens ?? 0;
    const completion = result.usage?.completionTokens ?? 0;
    if (reasoning > 0 && completion > 0 && reasoning / completion > 0.5) {
      findings.push(finding('info', template(t.reasoningTokens, {
        model: result.model,
        protocol: result.protocol,
        reasoning,
        completion,
      })));
    }
  }

  return Object.freeze({
    language,
    health: healthSummary(matrixReport, language),
    findings: Object.freeze(dedupeFindings(findings)),
    recommendations: Object.freeze(recommendations(discoveryReport, matrixReport, language)),
  });
}

export function resolveReportLanguage(language, env = process.env) {
  const value = String(language ?? '').toLowerCase();
  if (value === 'zh' || value === 'zh-cn' || value === 'cn') return 'zh';
  if (value === 'en' || value === 'en-us') return 'en';
  const locale = `${env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? ''}`.toLowerCase();
  if (locale.startsWith('zh')) return 'zh';
  return 'en';
}

function healthSummary(matrixReport, language = 'en') {
  const lang = resolveReportLanguage(language);
  const t = DICT[lang];
  const pass = matrixReport?.summary?.passCount ?? 0;
  const fail = matrixReport?.summary?.failCount ?? 0;
  const skip = matrixReport?.summary?.skippedCount ?? 0;
  if (pass > 0 && fail === 0) return Object.freeze({ status: 'pass', detail: t.healthPassDetail, pass, fail, skip });
  if (pass > 0 && fail > 0) return Object.freeze({ status: 'partial', detail: t.healthPartialDetail, pass, fail, skip });
  if (pass === 0 && fail > 0) return Object.freeze({ status: 'blocked', detail: t.healthBlockedDetail, pass, fail, skip });
  return Object.freeze({ status: 'unknown', detail: t.healthUnknownDetail, pass, fail, skip });
}

function recommendations(discoveryReport, matrixReport, language) {
  const t = DICT[resolveReportLanguage(language)];
  const output = [];
  if ((discoveryReport?.pricingSummary?.modelCount ?? 0) === 0) output.push(t.actionNoPricing);
  if ((matrixReport?.summary?.failCount ?? 0) > 0) output.push(t.actionFailures);
  if ((matrixReport?.results ?? []).some((result) => result.resolvedModel && result.resolvedModel !== result.model)) {
    output.push(t.actionResolvedModels);
  }
  if ((matrixReport?.results ?? []).some((result) => {
    const reasoning = result.usage?.reasoningTokens ?? 0;
    const completion = result.usage?.completionTokens ?? 0;
    return reasoning > 0 && completion > 0 && reasoning / completion > 0.5;
  })) {
    output.push(t.actionReasoningBudget);
  }
  return dedupeText(output);
}

function dedupeText(items) {
  return [...new Set(items)];
}

function formatHealth(health, language) {
  const t = DICT[resolveReportLanguage(language)];
  return t[`health${capitalize(health.status)}`] ?? health.status;
}

function localStatus(status, language) {
  const t = DICT[resolveReportLanguage(language)];
  if (status === 'pass') return t.pass;
  if (status === 'fail') return t.fail;
  if (status === 'skip') return t.skip;
  return status;
}

function finding(severity, message) {
  return Object.freeze({ severity, message });
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.severity}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function template(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function formatUsage(usage) {
  if (!usage) return '';
  const parts = [`p${usage.promptTokens}`, `c${usage.completionTokens}`];
  if (usage.reasoningTokens) parts.push(`r${usage.reasoningTokens}`);
  if (usage.cachedTokens) parts.push(`cache${usage.cachedTokens}`);
  return parts.join(' / ');
}

function noteForResult(result) {
  if (result.error) return result.error;
  if (result.signals?.toolName) return `tool=${result.signals.toolName}`;
  if (result.signals?.finishReason) return `finish=${result.signals.finishReason}`;
  if (Array.isArray(result.signals?.finishReasons) && result.signals.finishReasons.length) {
    return `finish=${result.signals.finishReasons.join(',')}`;
  }
  return '';
}

function formatMs(value) {
  const n = Number(value ?? 0);
  return n ? `${Math.round(n)}ms` : '';
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function truncate(value, maxLen) {
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

function capitalize(value) {
  const text = String(value ?? '');
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}
