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
- Treat GatewayCheck as a sensor. You write the diagnosis; the CLI returns facts.

## Agent-Led Entry

When the user asks to audit a gateway from an agent or TUI:

1. If GatewayCheck is not installed or mounted in the workspace, run `npx gatewaycheck install`.
2. Confirm the gateway URL, API key environment variable name, budget preset, and report language only when an audit is about to run.
3. Run `npx gatewaycheck audit <url> --key-env <env> --preset smart --plan-only --lang auto --agent` first unless the user already chose a specific preset or language.
4. Parse stdout as JSON facts. Do not ask GatewayCheck to produce the final human report.
5. Explain the selected models, protocols, and request budget before adding `--yes`.
6. Run live probes with `npx gatewaycheck audit <url> --key-env <env> --preset smart --yes --lang auto --agent`.
7. Use `facts.auth_status`, `facts.network_status`, `facts.matrix`, `facts.latency`, `facts.token_usage`, `facts.cache`, `facts.routing`, and `facts.probes` as the evidence base.
8. If the process exits `1`, inspect the JSON error/facts first; this usually means auth or network blocked useful diagnosis.
9. If the key environment variable is missing in a non-interactive shell, ask the user to set it locally or run the CLI guided flow; do not ask them to paste a raw key into chat.
10. Prefer `quick` or `smart`; use `broad` only after the user explicitly asks for wider coverage.

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
   - Use `--agent` for machine-readable JSON facts.
   - You produce the human diagnosis from those facts.
   - Call out permission issues, reasoning-token budget issues, protocol failures, and CLI-only restrictions.
   - Use `audit --plan-only --agent` first when model count is large, pricing is missing, or the user has not chosen a coverage level.

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
npx gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --plan-only --lang auto --agent
npx gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes --lang auto --agent
npx gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes --out reports/audit.json --md reports/audit.md
npm run audit -- --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --plan-only --lang auto --agent
npm run audit -- --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes --lang auto --agent
npm run audit -- --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes --out reports/audit.json --md reports/audit.md
npm run discover -- gatewaycheck.local.json
npm run agent -- gatewaycheck.local.json --yes
npm run cache -- gatewaycheck.local.json --yes
npm run stream -- gatewaycheck.local.json --yes
npm run matrix -- gatewaycheck.local.json --yes
npm run audit -- gatewaycheck.local.json --yes --out reports/audit.json --md reports/audit.md
```

Prefer `quick` or `smart` before any broad model coverage. If the gateway exposes many models or lacks a pricing catalog, ask whether the user wants representative models, specific models, or wider coverage before running more probes.
