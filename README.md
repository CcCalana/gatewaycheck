# GatewayCheck

[![npm version](https://img.shields.io/npm/v/gatewaycheck.svg)](https://www.npmjs.com/package/gatewaycheck)
[![CI](https://github.com/CcCalana/gatewaycheck/actions/workflows/ci.yml/badge.svg)](https://github.com/CcCalana/gatewaycheck/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/gatewaycheck.svg)](LICENSE)

[中文文档](README.zh-CN.md)

GatewayCheck is a low-cost diagnostic sensor for AI gateways, relay stations, and model proxies. It checks whether a gateway is reachable, which API protocols work, which models are visible, and whether routing, permissions, usage fields, and latency signals are trustworthy enough for real workloads.

GatewayCheck is built for agent-led development flows: the CLI collects clean facts, and your coding agent writes the diagnosis.

## Quick Start

Paste this into Codex, Claude Code, Cursor, or another coding agent:

```text
Install GatewayCheck in this workspace and use it as an AI gateway sensor.

Run:
npx gatewaycheck install

After installation, use GatewayCheck whenever I ask about AI gateway connectivity, model routing, protocol compatibility, streaming, cache, usage, or billing diagnosis. When an audit is needed, ask me for the gateway URL and the API key environment variable name. Do not ask me to paste the raw API key into chat.
```

That is the main path. The agent installs GatewayCheck, mounts the local rules, loads the skill when available, then asks for the gateway details only when it is ready to run an audit.

No API key is needed to install or mount GatewayCheck.

If you are not inside an agent yet, run GatewayCheck yourself:

```bash
npx gatewaycheck
```

The first screen shows the same agent-first setup path:

```text
1. Agent mode: install rules + Skill + CLI (recommended)
2. Show the copy-paste instruction for your coding agent
3. CLI mode: run a guided audit in this terminal
4. Command reference
```

The installation command is:

```bash
npx gatewaycheck install
```

It updates project agent rules such as `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/gatewaycheck.mdc`, or `.github/copilot-instructions.md`, and installs the bundled Codex skill.

Agent sensor mode:

```bash
npx gatewaycheck audit https://api.example.com \
  --preset smart \
  --plan-only \
  --agent
```

`--agent` and `--json-only` print compact machine-readable JSON to stdout. No Markdown report, color output, spinner text, or progress UI is mixed into stdout.

Direct guided CLI flow:

```bash
npx gatewaycheck https://api.example.com
```

If `GATEWAY_API_KEY` is not set, GatewayCheck asks you to paste the key for this run only. The key is not saved to a config file and is not printed in reports.

For repeated use, set your gateway key as an environment variable.

Windows PowerShell:

```powershell
$env:GATEWAY_API_KEY="sk-..."
```

macOS / Linux:

```bash
export GATEWAY_API_KEY="sk-..."
```

The guided CLI audit:

- discovers gateway metadata first
- previews the selected model/protocol plan
- asks before running credit-consuming matrix probes
- prints a Markdown report for human debugging

For a non-interactive agent run:

```bash
npx gatewaycheck audit https://api.example.com --preset smart --yes --agent
```

Save both Markdown and JSON:

```bash
npx gatewaycheck audit https://api.example.com \
  --preset smart \
  --yes \
  --md reports/audit.md \
  --out reports/audit.json
```

## What It Checks

GatewayCheck runs small, reproducible probes against the gateway you provide.

| Area | Checks |
|---|---|
| Discovery | `/api/status`, `/api/pricing`, `/v1/models` |
| OpenAI-compatible chat | `/v1/chat/completions` |
| Streaming | SSE events, `[DONE]`, TTFT, chunk timing |
| Tool calling | forced function call and JSON arguments |
| Responses API | `/v1/responses` smoke probe |
| Anthropic-compatible API | `/v1/messages` smoke probe |
| Gemini native API | `generateContent` smoke probe |
| Routing transparency | requested model vs returned model |
| Usage metadata | prompt, completion, cached, and reasoning tokens |
| Permissions | key group, platform route, and protocol restrictions |

GatewayCheck is not a model quality leaderboard. It is a gateway compatibility, cost-control, and transparency check.

## Install

One-off usage:

```bash
npx gatewaycheck https://api.example.com
```

Global install:

```bash
npm install -g gatewaycheck
gatewaycheck https://api.example.com
```

Requirements:

- Node.js 20+
- an HTTPS gateway URL
- an API key stored in an environment variable

GatewayCheck intentionally rejects raw key flags such as `--api-key` and `--key`.

## Common Workflows

### Mount GatewayCheck Into Agent Rules

```bash
npx gatewaycheck init
```

`init` updates existing rule files such as `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/gatewaycheck.mdc`, or `.github/copilot-instructions.md`. If none exist, it creates `AGENTS.md`.

### Show the Agent Install Instruction

```bash
npx gatewaycheck bootstrap
```

This prints the copy-paste instruction shown in the Quick Start. It does not require a key or gateway URL.

### Preview Before Spending Credits

```bash
npx gatewaycheck audit https://api.example.com --plan-only --agent
```

### Choose Report Language

```bash
npx gatewaycheck audit https://api.example.com --lang zh --yes
```

Supported values: `auto`, `en`, `zh`.

### Use a Different Key Variable

```bash
$env:PACKY_API_KEY="sk-..."
npx gatewaycheck audit https://api.example.com --key-env PACKY_API_KEY --yes
```

You can also skip environment setup for one-off checks. GatewayCheck will ask for the key securely when the variable is missing.

### Give Model Hints

Use model hints when `/v1/models` or `/api/pricing` is incomplete.

```bash
npx gatewaycheck audit https://api.example.com \
  --openai-model gpt-5.4-mini \
  --claude-model claude-sonnet-4-5 \
  --gemini-model gemini-2.5-flash \
  --yes
```

### Run a Specific Matrix

Create a local config:

```bash
gatewaycheck init --config
```

Edit `gatewaycheck.local.json`, then run:

```bash
gatewaycheck matrix gatewaycheck.local.json --yes --out reports/matrix.json
```

## Budget Presets

| Preset | Best For | Default Scope |
|---|---|---|
| `quick` | cheapest sanity check | 1 representative model, up to 4 matrix requests, 32 max output tokens |
| `smart` | recommended default | 3 representative models, up to 8 matrix requests, 64 max output tokens |
| `broad` | wider compatibility pass | 6 representative models, up to 18 matrix requests, 96 max output tokens |

Override budgets when needed:

```bash
npx gatewaycheck audit https://api.example.com \
  --preset quick \
  --max-requests 4 \
  --max-tokens 32 \
  --yes
```

## Command Reference

| Command | Purpose |
|---|---|
| `gatewaycheck` | open the setup menu |
| `gatewaycheck init` | mount GatewayCheck instructions into agent rule files |
| `gatewaycheck init --config` | create `gatewaycheck.local.json` |
| `gatewaycheck install` | mount agent rules, install Skill + CLI, and show agent next steps |
| `gatewaycheck bootstrap` | print the copy-paste install instruction for agents |
| `gatewaycheck <url>` | start a CLI-only guided audit for a gateway URL |
| `gatewaycheck check <url>` | same as CLI-only guided audit |
| `gatewaycheck prompt <url>` | print an optional agent-ready audit prompt for a known gateway |
| `gatewaycheck audit <url>` | run the full audit flow |
| `gatewaycheck discover <url>` | inspect public metadata and visible models |
| `gatewaycheck matrix <config>` | run configured model/protocol probes |
| `gatewaycheck agent <config>` | test agent-client protocol support |
| `gatewaycheck stream <config>` | test streaming transport |
| `gatewaycheck cache <config>` | test prompt-cache signals |
| `gatewaycheck skill` | show Codex skill installation instructions |
| `gatewaycheck skill --install` | install the bundled Codex skill |
| `gatewaycheck doctor` | check local release readiness |

Useful flags:

| Flag | Meaning |
|---|---|
| `--key-env <name>` | environment variable containing the API key |
| `--preset quick\|smart\|broad` | request and token budget preset |
| `--interactive` | ask before choosing audit coverage |
| `--plan-only` | show the audit plan without matrix probes |
| `--agent` | print compact machine-readable JSON facts for agents |
| `--json-only` | alias for `--agent` |
| `--lang auto\|en\|zh` | Markdown report language |
| `--model <id>` | default OpenAI-compatible model hint |
| `--openai-model <id>` | OpenAI-compatible model hint |
| `--claude-model <id>` | Anthropic-compatible model hint |
| `--gemini-model <id>` | Gemini-compatible model hint |
| `--protocols <list>` | comma-separated protocol list for matrix runs |
| `--max-models <n>` | audit planner model limit |
| `--max-requests <n>` | matrix request budget |
| `--max-tokens <n>` | max output tokens per probe |
| `--md <path>` | save Markdown report |
| `--out <path>` | save JSON report |
| `--json` | print the raw suite JSON to stdout |
| `--yes` | confirm credit-consuming probes |

## Agent Facts

In `--agent` mode, stdout is a single JSON object designed for model context. It includes:

- `auth_status`: whether authenticated endpoints accepted the key, with HTTP status
- `network_status`: timeout and transport failure counts
- `discovery`: gateway family, visible model count, pricing groups, and sample models
- `budget`: planned and used request budget
- `matrix`: pass/fail/skip counts by model and protocol
- `latency`: aggregate latency by endpoint and protocol
- `token_usage`: prompt, completion, cached, and reasoning token facts
- `cache`: observed prompt-cache hit signals
- `routing`: requested model vs returned model changes
- `probes`: per-endpoint raw facts for deeper agent analysis

Exit code `0` means GatewayCheck collected usable facts. Exit code `1` is reserved for fatal blockers such as authentication failure or network/transport failure that prevents useful diagnosis. Human Markdown reports remain available through the guided CLI and `--md`.

## Security And Privacy

GatewayCheck is local-first.

- It has no hosted backend.
- It does not collect keys, gateway URLs, reports, prompts, model lists, or usage data.
- API keys are read from environment variables.
- API keys are sent only to the gateway URL you provide.
- Raw key CLI flags are rejected.
- Reports are written only to paths you choose, or printed locally.
- `.env`, `.local` configs, `reports/`, and npm cache files are ignored by git.
- Error text is sanitized for common secret patterns.

If a key has been pasted into chat, an issue, or a terminal transcript, rotate it.

## Codex Skill

The Codex skill lives at [skills/gatewaycheck/SKILL.md](skills/gatewaycheck/SKILL.md). Use it when you want an agent to choose the budget, decide whether to test representative or specified models, run the CLI, and interpret the report.

Mount project rules and install the skill from the npm package:

```bash
npx gatewaycheck install
```

Replace an existing local copy:

```bash
npx gatewaycheck skill --install --force
```

Then restart Codex or reload your TUI session so it can discover the skill.

Generate an agent-ready instruction:

```bash
npx gatewaycheck bootstrap
```

`gatewaycheck prompt <url>` is optional when you already know the gateway URL and want a ready audit request. The main install flow does not require a key or URL.

The CLI remains the source of truth for probes and fact generation.

## Development

Clone and test:

```bash
git clone https://github.com/CcCalana/gatewaycheck.git
cd gatewaycheck
npm test
```

Run the local CLI:

```bash
npm run gatewaycheck -- help
```

Check package readiness:

```bash
npm run doctor
npm run pack:dry-run
```

## License

MIT. See [LICENSE](LICENSE).
