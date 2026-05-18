# Evaluation Expansion Plan

GatewayCheck should remain local-first, low-cost, and reproducible by default. It is not a model quality leaderboard. It is a gateway quality checker for protocol compatibility, routing, permissions, transparency, and transport behavior.

## Current Baseline

Implemented:

- Discovery: `/api/status`, `/api/pricing`, `/v1/models`.
- Matrix smoke tests: OpenAI chat, stream, tools, Responses, Anthropic Messages, Gemini native.
- Audit entrypoint: discovery, automatic model selection, bounded matrix, JSON and Markdown reports.
- Usage normalization: prompt, completion, total, cached, cache-write, and reasoning tokens when available.
- Streaming telemetry: TTFT, total latency, chunk counts, SSE events, JSON parse failures, `[DONE]`.
- Safety guardrails: HTTPS-only gateways, environment-variable keys, raw key flag rejection, sanitized errors, and explicit `--yes`.

Important constraints:

- Default suites must be low-cost and request-bounded.
- Errors are valid results and should be recorded as structured signals.
- Gateway compatibility, gateway quality, and model quality must stay separate.
- Full prompts and full responses should not be stored by default.
- Active port scanning, unrelated host discovery, and spoofed-header probing are out of scope for the default CLI.

## Suite Roadmap

| Suite | Purpose | Default Run | Cost | Stage |
|---|---|---:|---:|---|
| `discovery` | Identify metadata, pricing, visible models, and gateway family | yes | very low | current |
| `matrix` | Low-cost model/protocol coverage checks | `--yes` | low | current |
| `audit` | Product-oriented diagnosis and report generation | `--yes` | low to medium | current |
| `stream` | SSE integrity, TTFT, latency, and usage-through-stream | `--yes` | low | current |
| `cache` | Prompt-cache usage transparency | `--yes` | low to medium | current |
| `agent` | Agent client compatibility boundaries | `--yes` | low | current |
| `errors` | Invalid model, invalid parameters, 429/5xx structure, and secret leakage | `--yes` | low | next |
| `usage` | Usage completeness, request IDs, rate-limit headers, and token details | `--yes` | low | next |
| `protocol` | Deeper tool schemas, structured output, multimodal smoke, embeddings | `--yes` | low to medium | next |
| `stress` | Small concurrency, p50/p95, retry-after behavior | explicit opt-in | medium | later |
| `advanced-audit` | Long context, billing reconciliation, model identity checks | explicit opt-in | high | later |

## Near-Term Priorities

1. Interactive coverage selection.
   - Ask whether to test representative models, specified models, or broader coverage when many models are visible.
   - Show request and token budgets before live probes.

2. Report quality.
   - Keep health status, findings, and recommended actions at the top.
   - Localize reports with `--lang auto|en|zh`.
   - Keep raw JSON available for machines, but avoid dumping it into agent conversations by default.

3. Error boundary suite.
   - Probe invalid model, invalid parameter, unsupported endpoint, and small rate-limit cases.
   - Record whether error bodies are JSON, HTML, stack traces, or sanitized messages.
   - Detect accidental key/header leakage in error text.

4. Usage transparency suite.
   - Compare short chat, tools, and stream usage fields.
   - Record request IDs, rate-limit headers, retry-after, and provider-specific IDs.
   - Preserve enough raw usage detail for later repricing without storing full responses.

5. Deeper protocol probes.
   - Nested tool schema with object, array, enum, and `additionalProperties=false`.
   - Structured output smoke tests where supported.
   - Minimal multimodal and embedding checks only when explicitly configured.

## Scoring Direction

GatewayCheck should avoid a single universal score until enough real reports exist. Start with scenario profiles:

- `chat-relay`: chat and streaming reliability matter most.
- `agent-client`: tools, Responses, Anthropic tool use, and structured output matter most.
- `cost-optimizer`: pricing, usage fields, cache tokens, and token math matter most.
- `production-gateway`: latency, streaming integrity, rate limits, errors, and retries matter most.
- `enterprise-proxy`: error sanitization, request IDs, headers, privacy, and auditability matter most.

Raw metrics should remain available so scoring formulas can evolve without rerunning probes.

## Advanced Suites

These are useful but should stay opt-in:

- Long-context retrieval or NIAH tests.
- High-concurrency stress tests.
- Billing balance reconciliation.
- Model identity fingerprinting.
- Multi-region runners.

They are more expensive and easier to misinterpret, so they should never run as part of the default `quick` or `smart` audit.
