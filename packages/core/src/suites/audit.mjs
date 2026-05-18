import { analyzeAudit, renderAuditMarkdown } from '../runtime/audit-report.mjs';
import { buildAuditMatrixConfig } from '../runtime/audit-planner.mjs';
import { discoverGateway } from './discovery.mjs';
import { runMatrixSuite } from './matrix.mjs';

export async function runAuditSuite(config, apiKey, options = {}) {
  const language = options.language ?? config.language ?? 'auto';
  const discovery = options.discovery ?? await discoverGateway(config, apiKey);
  const { config: matrixConfig, plan } = buildAuditMatrixConfig(config, discovery, options);
  const matrix = await runMatrixSuite(matrixConfig, apiKey);
  const analysis = analyzeAudit(discovery, matrix, { language });
  const report = Object.freeze({
    schemaVersion: '0.2',
    suite: 'audit',
    gateway: {
      name: config.name ?? 'Unnamed Gateway',
      baseUrl: config.baseUrl,
      family: discovery.gateway?.family ?? 'unknown',
    },
    language: analysis.language,
    generatedAt: new Date().toISOString(),
    requestCount: (discovery.requestCount ?? 0) + (matrix.run?.requestCount ?? 0),
    auditPlan: plan,
    discovery,
    matrix,
    analysis,
  });

  return Object.freeze({
    report,
    markdown: renderAuditMarkdown(report, { language: analysis.language }),
  });
}
