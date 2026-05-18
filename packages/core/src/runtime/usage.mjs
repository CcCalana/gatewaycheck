export function normalizeOpenAIUsage(raw = {}) {
  raw ??= {};
  const promptTokens = number(raw.prompt_tokens ?? raw.input_tokens);
  const completionTokens = number(raw.completion_tokens ?? raw.output_tokens);
  const totalTokens = number(raw.total_tokens) || promptTokens + completionTokens;
  const cachedTokens = extractCachedTokens(raw);
  const reasoningTokens = extractReasoningTokens(raw);
  return usageShape({ promptTokens, completionTokens, totalTokens, cachedTokens, reasoningTokens, raw });
}

export function normalizeResponsesUsage(raw = {}) {
  raw ??= {};
  const promptTokens = number(raw.input_tokens ?? raw.prompt_tokens);
  const completionTokens = number(raw.output_tokens ?? raw.completion_tokens);
  const totalTokens = number(raw.total_tokens) || promptTokens + completionTokens;
  const cachedTokens = extractCachedTokens(raw);
  const reasoningTokens = extractReasoningTokens(raw);
  return usageShape({ promptTokens, completionTokens, totalTokens, cachedTokens, reasoningTokens, raw });
}

export function normalizeClaudeUsage(raw = {}) {
  raw ??= {};
  const promptTokens = number(raw.input_tokens);
  const completionTokens = number(raw.output_tokens);
  const totalTokens = promptTokens + completionTokens;
  const cachedTokens = number(raw.cache_read_input_tokens);
  const cacheWriteTokens = number(raw.cache_creation_input_tokens);
  return usageShape({ promptTokens, completionTokens, totalTokens, cachedTokens, cacheWriteTokens, raw });
}

export function normalizeGeminiUsage(raw = {}) {
  raw ??= {};
  const promptTokens = number(raw.promptTokenCount ?? raw.prompt_tokens);
  const completionTokens = number(raw.candidatesTokenCount ?? raw.completion_tokens ?? raw.output_tokens);
  const totalTokens = number(raw.totalTokenCount ?? raw.total_tokens) || promptTokens + completionTokens;
  const cachedTokens = number(raw.cachedContentTokenCount ?? raw.cached_tokens);
  const reasoningTokens = number(raw.thoughtsTokenCount ?? raw.reasoning_tokens);
  return usageShape({ promptTokens, completionTokens, totalTokens, cachedTokens, reasoningTokens, raw });
}

export function extractCachedTokens(raw = {}) {
  return number(
    raw.prompt_tokens_details?.cached_tokens ??
    raw.input_tokens_details?.cached_tokens ??
    raw.prompt_cache_hit_tokens ??
    raw.cache_read_input_tokens
  );
}

export function extractReasoningTokens(raw = {}) {
  return number(
    raw.completion_tokens_details?.reasoning_tokens ??
    raw.output_tokens_details?.reasoning_tokens ??
    raw.completion_tokens_details?.reasoningTokens ??
    raw.output_tokens_details?.reasoningTokens
  );
}

export function cacheHitRatePct(cachedTokens, promptTokens) {
  if (!promptTokens) return 0;
  return Math.round((cachedTokens * 10000) / promptTokens) / 100;
}

function usageShape({
  promptTokens,
  completionTokens,
  totalTokens,
  cachedTokens,
  cacheWriteTokens = 0,
  reasoningTokens = 0,
  raw,
}) {
  return Object.freeze({
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheWriteTokens,
    reasoningTokens,
    cacheHitRatePct: cacheHitRatePct(cachedTokens, promptTokens),
    raw,
  });
}

function number(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
