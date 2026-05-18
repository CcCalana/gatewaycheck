# GatewayCheck Audit Report

Gateway: Example Gateway (https://api.example.com)
Generated: 2026-05-17T00:00:00.000Z

## Executive Summary

- Health: partial - Some probes passed and some failed; review protocol or key-group findings.
- Requests used: 9
- Discovery family: unknown
- Visible models: 12
- Pricing catalog models: 0
- Matrix pass/fail: 4/2
- Protocols tested: openai-responses, openai-chat, openai-stream, openai-tools, anthropic-messages, gemini-generate

## Findings

- [info] No public pricing catalog was discovered; cost ranking is unavailable, so audit selection used visible and configured model candidates.
- [warn] claude-example on anthropic-messages failed: {"error":{"message":"This group does not allow /v1/messages dispatch","type":"permission_error"}}
- [warn] gemini-example-flash on gemini-generate failed: {"error":{"message":"API key group platform is not gemini","status":"INVALID_ARGUMENT"}}
- [info] gpt-example-router on openai-responses resolved to gpt-example-mini; treat this as a gateway model alias or routing signal.

## Recommended Actions

- No pricing catalog was found. Prefer explicit model hints or specified coverage if cost control matters.
- Review failed protocols and key-group permissions before using this gateway for agents or production traffic.
- Model aliasing was detected. Confirm whether routed upstream models match your expectations.

## Model / Protocol Matrix

| Model | Protocol | Status | HTTP | Latency | Usage | Notes |
|---|---|---:|---:|---:|---:|---|
| gpt-example-router -> gpt-example-mini | openai-responses | pass | 200 | 1200ms | p21 / c2 |  |
| gpt-example-router | openai-chat | pass | 200 | 980ms | p21 / c2 | finish=stop |
| gpt-example-router | openai-stream | pass | 200 | 1300ms | p21 / c2 | finish=stop |
| gpt-example-router | openai-tools | pass | 200 | 1800ms | p67 / c18 | tool=get_weather |
| claude-example | anthropic-messages | fail | 403 | 350ms | p0 / c0 | permission_error |
| gemini-example-flash | gemini-generate | fail | 400 | 320ms | p0 / c0 | INVALID_ARGUMENT |

## By Protocol

| Protocol | Pass | Fail | Skip | Avg Latency |
|---|---:|---:|---:|---:|
| openai-responses | 1 | 0 | 0 | 1200ms |
| openai-chat | 1 | 0 | 0 | 980ms |
| openai-stream | 1 | 0 | 0 | 1300ms |
| openai-tools | 1 | 0 | 0 | 1800ms |
| anthropic-messages | 0 | 1 | 0 | 350ms |
| gemini-generate | 0 | 1 | 0 | 320ms |

## Selected Plan

- gpt-example-router: openai-responses, openai-chat, openai-stream, openai-tools (OpenAI-compatible candidate)
- claude-example: anthropic-messages (Anthropic-compatible model)
- gemini-example-flash: gemini-generate (Gemini-native model)
