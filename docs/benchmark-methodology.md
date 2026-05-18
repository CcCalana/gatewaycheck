# Benchmark Methodology

## Test Suites

### Discovery

Zero or low-cost checks:

- `GET /api/status`
- `GET /api/pricing`
- `GET /v1/models` with key

Expected outputs:

- Gateway family: New API, One API, OpenAI-compatible, Anthropic-compatible, unknown.
- Public docs URL, visible model list, supported endpoint types, group names.

### Agent Compatibility

Run with strict request budgets.

| Probe | Endpoint | Success Signal |
|---|---|---|
| OpenAI chat | `/v1/chat/completions` | `object=chat.completion` |
| OpenAI tools | `/v1/chat/completions` | `finish_reason=tool_calls` |
| Responses | `/v1/responses` | `object=response` |
| Responses tools | `/v1/responses` | `output.type=function_call` |
| Claude messages | `/v1/messages` | `type=message` |
| Claude tool_use | `/v1/messages` | `stop_reason=tool_use` |
| Assistants boundary | `/v1/threads` | 404 means not a hosted runtime |

Classify as:

- `agent-client-compatible`: tool protocols pass, but no hosted state/runtime.
- `agent-runtime-compatible`: threads/runs/files or equivalent stateful runtime exists.
- `chat-only`: basic chat passes but tools fail.

### Prompt Cache

Use two identical requests:

- Same model.
- Same stable prefix.
- Same `prompt_cache_key` when supported.
- Low `max_tokens`.

Record:

- `prompt_tokens`
- `cached_tokens`
- `cache_hit_rate_pct`
- `completion_tokens`
- raw usage details

### Performance

Run at least:

- Cold single request.
- Warm repeated request.
- Streaming TTFT.
- Long-context request.
- Small concurrency batches.

Record p50/p95, error rate, TTFT, total latency, throughput, and upstream request IDs if returned.

### Streaming

Start with a low-cost OpenAI-compatible streaming probe:

- `POST /v1/chat/completions`
- `stream: true`
- `stream_options.include_usage: true` when supported
- Low `max_tokens`
- Very short prompt, because some reasoning models may emit hidden reasoning tokens even when the visible answer is tiny

Record:

- `ttftMs`
- `totalLatencyMs`
- `networkChunkCount`
- `sseEventCount`
- `jsonEventCount`
- `chunkGapMsAvg`
- `chunkGapMsP95`
- `tokensPerSecond` when usage is returned
- Whether `[DONE]` was observed
- Whether any SSE data block failed JSON parsing

Streaming pass/fail is about gateway transport integrity, not model quality.

### Model / Protocol Matrix

Use a matrix when one gateway should be evaluated across several models or protocols.

Recommended low-cost protocols:

- `openai-chat`: `/v1/chat/completions`, non-streaming, short response.
- `openai-stream`: `/v1/chat/completions`, streaming SSE integrity and TTFT.
- `openai-tools`: `/v1/chat/completions` with a forced function tool call.
- `openai-responses`: `/v1/responses`, non-streaming, short response.
- `anthropic-messages`: `/v1/messages`, only for Claude-compatible models.
- `gemini-generate`: `/v1beta/models/{model}:generateContent`, only for Gemini-compatible models.

Record:

- pass/fail/skip by model
- pass/fail/skip by protocol
- latency and usage per probe
- protocol-specific signals such as tool name, `[DONE]`, finish reason, or Gemini candidate count

The matrix suite should remain a smoke test. Deep quality evaluation, long-context tests, and heavy concurrency belong in opt-in advanced suites.

Reasoning-heavy models may consume the whole output budget before emitting visible text. If a probe stops with `finish_reason=length`, zero visible content, and nonzero reasoning tokens, rerun that model with a wider `requestBudget.maxOutputTokens` before classifying the gateway protocol as incompatible.

### Audit

Audit is the product-oriented entrypoint:

1. Run discovery.
2. Read visible models from `/v1/models`.
3. Use pricing metadata to select low-cost candidates.
4. If pricing metadata is absent, infer protocol families from configured model roles and model-name hints.
5. Build a bounded matrix plan.
6. Run the matrix suite.
7. Render JSON and Markdown.

Audit should explain results, not only store raw metrics. It should call out token/group permission failures, reasoning-token budget issues, protocol-specific failures, and CLI-only restrictions.

## Scoring Dimensions

| Dimension | Weight Draft | Notes |
|---|---:|---|
| Agent compatibility | 25 | Tools, Responses, Claude tool_use, boundaries |
| Cache efficiency | 20 | Hit rate, usage transparency, billing evidence |
| Performance | 20 | TTFT, latency, throughput |
| Stability | 15 | Error rate, retries, stream interruptions |
| Billing accuracy | 10 | Usage fields, hidden prompt signs |
| Transparency | 10 | Public pricing, status, docs |

These weights are placeholders. Keep raw metrics so rankings can be recalculated.
