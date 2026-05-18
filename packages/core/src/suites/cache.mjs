import { requestJson } from '../runtime/http-client.mjs';
import { normalizeOpenAIUsage } from '../runtime/usage.mjs';

export async function runCacheSuite(config, apiKey) {
  const timeoutMs = config.requestBudget?.timeoutMs ?? 90000;
  const maxTokens = Math.min(config.requestBudget?.maxOutputTokens ?? 48, 64);
  const model = config.models?.cheap ?? config.models?.openai ?? 'gpt-5.4-mini';
  const cacheConfig = config.cache ?? {};
  const prompt = buildCachePrompt(cacheConfig.complexity ?? 'agent');
  const promptCacheKey = cacheConfig.promptCacheKey ?? `gatewaycheck-${Date.now()}`;
  const pauseMs = cacheConfig.pauseMs ?? 2000;

  const body = {
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    prompt_cache_key: promptCacheKey,
    max_tokens: maxTokens,
    temperature: 0,
    stream: false,
  };

  const first = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body,
  });
  if (pauseMs > 0) await delay(pauseMs);
  const second = await requestJson({
    baseUrl: config.baseUrl,
    path: '/v1/chat/completions',
    method: 'POST',
    apiKey,
    timeoutMs,
    body,
  });

  const firstUsage = normalizeOpenAIUsage(first.data?.usage);
  const secondUsage = normalizeOpenAIUsage(second.data?.usage);
  return Object.freeze({
    schemaVersion: '0.1',
    suite: 'prompt-cache',
    gateway: {
      name: config.name ?? 'Unnamed Gateway',
      baseUrl: config.baseUrl,
    },
    requestCount: 2,
    model: second.data?.model ?? first.data?.model ?? model,
    prompt: {
      complexity: cacheConfig.complexity ?? 'agent',
      promptCacheKey,
    },
    probes: Object.freeze([
      summarizeCacheProbe('first', first, firstUsage),
      summarizeCacheProbe('second', second, secondUsage),
    ]),
    summary: {
      promptTokens: secondUsage.promptTokens,
      firstCachedTokens: firstUsage.cachedTokens,
      secondCachedTokens: secondUsage.cachedTokens,
      secondCacheHitRatePct: secondUsage.cacheHitRatePct,
    },
    generatedAt: new Date().toISOString(),
  });
}

export function buildCachePrompt(complexity = 'agent') {
  const lines = [];
  const count = complexity === 'basic' ? 70 : 90;
  for (let i = 1; i <= count; i += 1) {
    lines.push(`Rule ${i}: Preserve intent, validate inputs, plan tool calls, avoid fabricating facts, keep secrets out of logs, and return structured results.`);
  }
  if (complexity === 'basic') {
    return {
      system: `Stable cache probe prefix.\n${lines.join('\n')}`,
      user: 'Reply exactly OK.',
    };
  }
  return {
    system: [
      'You are testing prompt-cache behavior for an agent gateway.',
      'Maintain a task ledger with goal, constraints, tools, risks, and final schema.',
      'If a tool is needed, describe the tool call in JSON before using it.',
      'Never expose API keys, bearer tokens, secrets, cookies, or private headers.',
      'Stable policy appendix:',
      lines.join('\n'),
      'Decision rubric: classify task, identify constraints, decide tool need, produce shortest valid output.',
    ].join('\n\n'),
    user: 'Analyze this request as an agent router and return compact JSON with fields task_type, needs_tool, cache_probe, final_word. Set final_word to READY.',
  };
}

function summarizeCacheProbe(id, response, usage) {
  return Object.freeze({
    id,
    status: response.ok ? 'pass' : 'fail',
    httpStatus: response.status,
    latencyMs: response.latencyMs,
    model: response.data?.model,
    content: response.data?.choices?.[0]?.message?.content,
    usage,
    error: response.ok ? undefined : response.errorText,
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
