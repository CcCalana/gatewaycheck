# GatewayCheck

[Chinese README](README.zh-CN.md)

GatewayCheck is a cost-controlled CLI and Codex skill for auditing AI gateway / relay services.

Give it a gateway URL and an API key environment variable, and it will run a small, reproducible set of probes to answer practical questions:

- Can this gateway be reached safely over HTTPS?
- Does it expose public status, pricing, or model metadata?
- Which OpenAI-compatible, Responses API, streaming, tool calling, Anthropic, or Gemini protocols work?
- Are model groups, token permissions, or platform routes blocking certain protocols?
- Does the gateway rewrite model aliases or route a requested model to a different upstream model?
- Are usage fields, cached tokens, reasoning tokens, latency, TTFT, and request IDs visible enough for diagnosis?

The default goal is not to rank model quality. The default goal is to find major gateway compatibility, permission, routing, and transparency issues with as few requests as possible.

## Why This Exists

AI gateway users often want to know whether a relay station is reliable before spending real credits on long chats, agents, or production traffic. A manual test is easy to fool: one chat request may pass while streaming, tool calling, Claude-style messages, Gemini native calls, or group permissions fail.

GatewayCheck turns that check into a bounded audit funnel:

1. Discover metadata first.
2. Spend credits only after explicit confirmation.
3. Pick a small representative matrix by default.
4. Save structured JSON and a human-readable Markdown report.
5. Keep raw keys out of config files, logs, and reports.

## Current Status

This is an early lightweight project. It already supports real gateway audits, but the scope is intentionally conservative.

Implemented:

- CLI commands for discovery, agent compatibility, prompt cache, streaming, matrix, and audit suites.
- OpenAI-compatible chat completions.
- OpenAI-compatible streaming with SSE integrity and TTFT metrics.
- OpenAI-compatible tool calling.
- OpenAI Responses API smoke probe.
- Anthropic Messages API smoke probe.
- Gemini native `generateContent` smoke probe.
- New API-like pricing catalog parsing when `/api/pricing` is available.
- Automatic audit planning from pricing metadata, visible models, configured model roles, and model-name hints.
- Interactive audit planning with explicit budget confirmation.
- `audit --plan-only` previews the selected model/protocol matrix before spending matrix requests.
- Markdown and JSON audit reports.
- `doctor` release-readiness checks for maintainers.
- A Codex skill workflow in `skills/gatewaycheck`.

Not implemented yet:

- True all-model exhaustive mode with per-model budget confirmation.
- Billing reconciliation against provider dashboards.
- Long-context, concurrency, and quality eval suites.
- Native Claude CLI / Claude Code protocol probes.

## Install / Run

Requirements:

- Node.js 20+
- HTTPS gateway URL
- API key stored in an environment variable

Recommended one-off usage:

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset smart \
  --yes
```

Global CLI install:

```bash
npm install -g gatewaycheck
gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes
```

Source checkout, recommended when using the Codex skill:

```bash
git clone <your-repo-url>
cd GatewayCheck
npm test
```

No runtime npm dependencies are required at the moment.

## Quick Start

Set your key in an environment variable. Do not pass raw keys as CLI flags and do not write them into JSON config files.

macOS / Linux:

```bash
export GATEWAY_API_KEY="sk-..."
```

Windows PowerShell:

```powershell
$env:GATEWAY_API_KEY="sk-..."
```

Run a smart audit from just a base URL:

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset smart \
  --yes \
  --out reports/example-audit.json \
  --md reports/example-audit.md
```

By default, `audit` prints a compact Markdown report and saves JSON only when `--out` is provided. Use `--json` if you also want the full JSON on stdout.

Preview the planned model/protocol matrix before running credit-consuming probes:

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset smart \
  --plan-only \
  --lang en
```

Choose the report language explicitly when needed:

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --lang zh \
  --yes
```

## Budget Presets

GatewayCheck is designed to protect both API credits and agent context.

| Preset | Intended Use | Default Scope |
|---|---|---|
| `quick` | Cheapest sanity check | 1 representative model, up to 4 requests, 32 max output tokens |
| `smart` | Recommended default | 3 representative models, up to 8 requests, 64 max output tokens |
| `broad` | Wider coverage audit | 6 representative models, up to 18 requests, 96 max output tokens |

You can override the preset:

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset quick \
  --max-requests 4 \
  --max-tokens 32 \
  --yes
```

## Choosing Models

If the gateway exposes `/api/pricing`, GatewayCheck can use pricing metadata to select low-cost representative models.

If pricing metadata is absent, it falls back to:

- visible models from `/v1/models`
- configured model hints
- model-name hints such as `gpt`, `codex`, `claude`, `gemini`, `deepseek`, or `qwen`

You can provide model hints directly:

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --openai-model gpt-5.4-mini \
  --claude-model claude-sonnet-4-5 \
  --gemini-model gemini-2.5-flash \
  --preset smart \
  --yes
```

For a custom matrix, use a config file.

```json
{
  "name": "Example Gateway",
  "baseUrl": "https://api.example.com",
  "apiKeyEnv": "GATEWAY_API_KEY",
  "requestBudget": {
    "maxRequests": 8,
    "maxOutputTokens": 64,
    "timeoutMs": 90000
  },
  "matrix": {
    "models": [
      {
        "id": "gpt-5.4-mini",
        "label": "cheap OpenAI-compatible model",
        "protocols": ["openai-chat", "openai-stream", "openai-tools", "openai-responses"]
      },
      {
        "id": "claude-sonnet-4-5",
        "label": "Claude-compatible model",
        "protocols": ["anthropic-messages"]
      },
      {
        "id": "gemini-2.5-flash",
        "label": "Gemini-compatible model",
        "protocols": ["gemini-generate"]
      }
    ]
  }
}
```

Then run:

```bash
gatewaycheck matrix gatewaycheck.local.json --yes --out reports/matrix.json
```

## Commands

Installed or `npx` usage:

```bash
npx gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --yes
gatewaycheck discover [config-or-flags]
gatewaycheck agent [config-or-flags] --yes
gatewaycheck cache [config-or-flags] --yes
gatewaycheck stream [config-or-flags] --yes
gatewaycheck matrix [config-or-flags] --yes
gatewaycheck audit [config-or-flags] --yes
gatewaycheck audit [config-or-flags] --plan-only
gatewaycheck doctor
gatewaycheck init
```

Source checkout usage:

```bash
npm run init
npm run discover -- [config-or-flags]
npm run agent -- [config-or-flags] --yes
npm run cache -- [config-or-flags] --yes
npm run stream -- [config-or-flags] --yes
npm run matrix -- [config-or-flags] --yes
npm run audit -- [config-or-flags] --yes
npm run doctor
```

Useful flags:

| Flag | Meaning |
|---|---|
| `--base-url <url>` | Build a temporary config from a gateway URL |
| `--key-env <name>` | Environment variable that contains the API key |
| `--name <name>` | Gateway name used in reports |
| `--model <id>` | Default OpenAI-compatible model hint |
| `--openai-model <id>` | OpenAI-compatible model hint |
| `--claude-model <id>` | Anthropic-compatible model hint |
| `--gemini-model <id>` | Gemini-compatible model hint |
| `--protocols <list>` | Comma-separated protocols for matrix runs |
| `--preset quick\|smart\|broad` | Audit budget preset |
| `--interactive` | Ask before choosing audit coverage |
| `--plan-only` | Show the audit plan without running matrix probes |
| `--lang auto\|en\|zh` | Markdown report language |
| `--max-models <n>` | Audit planner model limit |
| `--max-requests <n>` | Request budget |
| `--max-tokens <n>` | Max output tokens per probe |
| `--out <path>` | Save JSON report |
| `--md <path>` | Save Markdown audit report |
| `--json` | Print full JSON to stdout |
| `--yes` | Required for key-consuming suites |

Raw key flags such as `--api-key` and `--key` are intentionally rejected.

## Supported Protocol Probes

| Protocol ID | Endpoint | What It Checks |
|---|---|---|
| `openai-chat` | `/v1/chat/completions` | Basic non-streaming chat response |
| `openai-stream` | `/v1/chat/completions` | SSE transport, `[DONE]`, TTFT, chunk metrics |
| `openai-tools` | `/v1/chat/completions` | Forced function tool call and JSON arguments |
| `openai-responses` | `/v1/responses` | Responses API compatibility and visible output |
| `anthropic-messages` | `/v1/messages` | Anthropic Messages API compatibility |
| `gemini-generate` | `/v1beta/models/{model}:generateContent` | Gemini native content generation |

## Reading The Report

Audit reports include:

- overall health status
- discovery family
- visible model count
- pricing catalog availability
- selected model/protocol plan
- pass/fail matrix
- HTTP status and latency
- token usage, cached tokens, and reasoning tokens when available
- stream TTFT and SSE integrity
- model alias or routing signals
- permission, platform group, or CLI-only restriction findings
- recommended next actions

Common findings:

- `No public pricing catalog was discovered`: the tool cannot prove which model is cheapest.
- `resolved to <model>`: the requested model may be an alias or gateway route.
- `does not allow /v1/messages dispatch`: the key group probably does not allow Anthropic-native calls.
- `platform is not gemini`: the key group is not configured for Gemini-native calls.
- `reasoning tokens`: a reasoning model may need a larger max-token budget before judging it incompatible.

## Skill + CLI Workflow

The recommended product shape is Skill + CLI:

- Use the CLI through `npx` or a global install for deterministic, reproducible runs.
- Use the Codex skill when an agent should choose the budget, ask whether to test selected models or broader coverage, and interpret the report.

Use `skills/gatewaycheck/SKILL.md` when you want an agent to:

- inspect a new gateway URL
- choose `quick`, `smart`, or `broad`
- decide whether to ask the user before testing many models
- interpret failures and recommend next probes
- avoid unnecessary full JSON output in the conversation

The recommended human-in-the-loop behavior is:

1. Run discovery.
2. If model count is small and pricing is visible, run `smart`.
3. If model count is large or pricing is missing, ask whether the user wants representative models, specified models, or broad coverage.
4. Never run all visible models without explicit confirmation.

## Privacy & Data Handling

GatewayCheck is local-first and does not collect user keys, gateway URLs, reports, prompts, model lists, usage data, or any other user information.

- There is no hosted GatewayCheck backend.
- There is no telemetry, analytics endpoint, account system, or remote report upload.
- API keys are read from environment variables and used only as `Authorization` headers for the gateway URL you provide.
- Benchmark requests are sent only to the configured gateway during a run. Installing with `npx` or `npm` downloads the package from the npm registry, which is separate from benchmark execution.
- JSON and Markdown reports are written only to local paths you choose, or printed locally to stdout.
- Reports may contain gateway URLs, model names, HTTP status codes, usage metadata, and sanitized error messages. Review reports before sharing them publicly.

See [examples/redacted-audit.md](examples/redacted-audit.md) for a share-safe sample report.

## Safety

GatewayCheck has a few deliberate guardrails:

- Only HTTPS gateway URLs are allowed.
- API keys are read from environment variables.
- Raw key CLI flags are rejected.
- Config files containing raw `apiKey` values are rejected.
- Reports, `.local` config files, `.env` files, and logs are ignored by `.gitignore`.
- Error text is sanitized for common secret patterns.
- Key-consuming suites require `--yes`.

If a key has been pasted into chat, an issue tracker, or a terminal transcript, rotate it.

## Project Structure

```text
packages/core        Core probes, planners, report builders, HTTP clients
packages/cli         Local CLI wrapper
configs/             Example config
docs/                Methodology, schema, roadmap, research notes
examples/            Redacted example configs and reports
skills/              Codex skill workflow
reports/             Local generated reports, ignored by git
```

## Development

Run tests:

```bash
npm test
```

Run the CLI help:

```bash
npm run gatewaycheck -- help
```

Check release readiness:

```bash
npm run doctor
npm run pack:dry-run
```

Maintainer publishing notes live in [docs/release-checklist.md](docs/release-checklist.md).

Create a local config:

```bash
npm run init
```

## Roadmap

Near-term:

- Safer all-model mode with per-provider and per-protocol budgets.
- More readable report scoring and badges.
- Optional repeated latency sampling.
- Claude Code / CLI-specific compatibility probes.

Later:

- Long-context and prompt-cache benchmark profiles.
- Concurrency and rate-limit tests.
- Billing reconciliation helpers.
- Historical report comparison.
- Web dashboard.

## License

MIT. See [LICENSE](LICENSE).
