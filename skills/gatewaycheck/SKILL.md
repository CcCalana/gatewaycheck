---
name: gatewaycheck
description: Benchmark and audit AI API gateways, relay stations, New API deployments, OpenAI-compatible APIs, Claude-compatible APIs, agent tool-calling compatibility, Responses API support, prompt cache hit rates, usage transparency, latency, and billing signals. Use when Codex needs to test or design tests for an LLM gateway, AI relay, model proxy, API relay, New API instance, agent compatibility, tool_calls/tool_use, or prompt caching.
---

# GatewayCheck

## Operating Rules

- Read API keys only from environment variables.
- Never print or persist API keys, bearer tokens, cookies, or authorization headers.
- Start with public discovery before key-consuming tests.
- Use the cheapest suitable model by default.
- Keep `max_tokens` low unless the user asks for quality or long-context tests.
- State request count and expected token budget before running live tests.
- Distinguish agent-client compatibility from hosted agent runtime support.

## Workflow

1. Discover the gateway:
   - Check `/api/status`.
   - Check `/api/pricing`.
   - Check `/v1/models` only if a key is available.

2. Run a low-cost smoke test:
   - `/v1/chat/completions`
   - short prompt, low `max_tokens`, non-streaming.

3. Test agent protocols:
   - OpenAI Chat Completions `tools` should return `tool_calls`.
   - OpenAI Responses should return `object=response`.
   - Responses `tools` should return `output.type=function_call`.
   - Anthropic `/v1/messages` should return `type=message`.
   - Anthropic tools should return `stop_reason=tool_use`.
   - `/v1/threads` returning 404 means the gateway is not a hosted Assistants runtime.

4. Test prompt cache:
   - Send the same stable long prefix twice.
   - Use the same `prompt_cache_key` when supported.
   - Compute `cached_tokens / prompt_tokens`.
   - Record raw usage detail fields.

5. Test streaming transport:
   - Use OpenAI-compatible `/v1/chat/completions` with `stream: true`.
   - Record TTFT, total latency, chunk counts, JSON parse failures, and whether `[DONE]` was observed.
   - Treat this as gateway transport integrity, not model quality.

6. Test a model/protocol matrix when the user wants broader coverage:
   - Use `matrix.models` to list target models and per-model protocols.
   - Keep each probe as a low-cost smoke test.
   - Compare OpenAI chat/stream/tools/responses, Anthropic messages, and Gemini native only when configured or inferred from model names.
   - Respect `requestBudget.maxRequests`; skipped probes are valid budget outcomes.

7. Run an audit when the user provides a key and gateway address and wants an overall diagnosis:
   - Run discovery first.
   - Select visible low-cost candidate models from `/v1/models` and pricing metadata.
   - If pricing metadata is absent, use configured model roles and model-name hints:
     `gpt`/`codex` for OpenAI Responses, `claude` for Anthropic Messages, and `gemini` for Gemini native.
   - Run a bounded matrix.
   - Produce JSON plus a Markdown analysis table.
   - Call out permission issues, reasoning-token budget issues, protocol failures, and CLI-only restrictions.
   - Use `audit --plan-only` first when model count is large, pricing is missing, or the user has not chosen a coverage level.

8. Produce a compact report:
   - Pass/fail per endpoint.
   - Latency and usage.
   - Model/protocol matrix coverage when tested.
   - Cache hit rate.
   - Streaming TTFT and SSE integrity when tested.
   - Agent compatibility classification.
   - Boundary findings.

## Result Language

Use these classifications:

- `chat-only`: chat works, tools fail or are untested.
- `agent-client-compatible`: tool protocols work, but no hosted runtime state.
- `agent-runtime-compatible`: threads/runs/files or equivalent stateful agent runtime works.
- `unknown`: insufficient data.

## Local Project

If the GatewayCheck project is available, prefer its CLI and core modules:

```bash
npx gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes --out reports/audit.json --md reports/audit.md
npx gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --plan-only --lang auto
npm run audit -- --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes --out reports/audit.json --md reports/audit.md
npm run audit -- --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --plan-only --lang auto
npm run discover -- gatewaycheck.local.json
npm run agent -- gatewaycheck.local.json --yes
npm run cache -- gatewaycheck.local.json --yes
npm run stream -- gatewaycheck.local.json --yes
npm run matrix -- gatewaycheck.local.json --yes
npm run audit -- gatewaycheck.local.json --yes --out reports/audit.json --md reports/audit.md
```

Prefer `quick` or `smart` before any broad model coverage. If the gateway exposes many models or lacks a pricing catalog, ask whether the user wants representative models, specific models, or wider coverage before running more probes.
