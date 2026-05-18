# Report Schema Draft

CLI output should stay JSON-serializable and platform-friendly.

New suites should use the `0.2` envelope. Existing suites may still emit the earlier compact shape until migrated.

Agent mode is the primary integration surface for coding agents:

```bash
npx gatewaycheck audit https://api.example.com --preset smart --plan-only --agent
```

`--agent` and `--json-only` emit a compact `0.1` facts envelope to stdout:

```json
{
  "schemaVersion": "0.1",
  "producedBy": "gatewaycheck",
  "mode": "agent",
  "suite": "audit",
  "status": "degraded",
  "ok": true,
  "exitCode": 0,
  "gateway": {
    "name": "Example Gateway",
    "baseUrl": "https://api.example.com",
    "family": "new-api-like"
  },
  "facts": {
    "auth_status": {
      "checked": true,
      "ok": true,
      "http_status": 200,
      "endpoint": "/v1/models"
    },
    "network_status": {
      "checked": true,
      "ok": true,
      "status_zero_count": 0,
      "timeout_count": 0
    },
    "matrix": {
      "pass_count": 2,
      "fail_count": 1,
      "skip_count": 0,
      "protocols": ["openai-chat", "openai-stream"]
    },
    "token_usage": {
      "prompt_tokens": 42,
      "completion_tokens": 3,
      "cached_tokens": 0,
      "reasoning_tokens": 0,
      "cache_hit": false
    },
    "routing": {
      "changed": true,
      "changes": []
    },
    "probes": []
  }
}
```

In agent mode, stdout must remain a single JSON object. Human Markdown and raw suite JSON are fallback surfaces for manual debugging.

```json
{
  "schemaVersion": "0.2",
  "gateway": {
    "name": "Example Gateway",
    "baseUrl": "https://api.example.com",
    "family": "new-api"
  },
  "run": {
    "id": "local-stream-20260516000000",
    "suite": "stream",
    "startedAt": "2026-05-16T00:00:00.000Z",
    "finishedAt": "2026-05-16T00:00:10.000Z",
    "durationMs": 10000,
    "requestCount": 1,
    "maxOutputTokens": 96
  },
  "results": [
    {
      "id": "stream-chat-ttft",
      "status": "pass",
      "endpoint": "/v1/chat/completions",
      "method": "POST",
      "httpStatus": 200,
      "latencyMs": 2100,
      "model": "gpt-5.4-mini",
      "metrics": {
        "ttftMs": 420,
        "totalLatencyMs": 2100,
        "networkChunkCount": 40,
        "sseEventCount": 39,
        "jsonEventCount": 38,
        "chunkGapMsAvg": 44.2,
        "chunkGapMsP95": 90.1,
        "tokensPerSecond": 31.4
      },
      "usage": {
        "promptTokens": 25,
        "completionTokens": 64,
        "totalTokens": 89,
        "cachedTokens": 0,
        "cacheHitRatePct": 0
      },
      "signals": {
        "sseDone": true,
        "streamUsageReturned": true,
        "jsonErrorCount": 0
      },
      "headers": {
        "requestId": "req_...",
        "retryAfter": null,
        "rateLimit": {},
        "trace": {
          "traceparent": false,
          "tracestate": false
        }
      }
    }
  ],
  "summary": {
    "passCount": 1,
    "failCount": 0,
    "streamIntegrity": "pass",
    "ttftMs": 420,
    "tokensPerSecond": 31.4
  }
}
```

Matrix suites use the same envelope, with model/protocol dimensions:

```json
{
  "schemaVersion": "0.2",
  "run": {
    "suite": "matrix",
    "requestCount": 5
  },
  "results": [
    {
      "id": "openai-chat:qwen3.5-flash",
      "protocol": "openai-chat",
      "model": "qwen3.5-flash",
      "resolvedModel": "upstream-model-id",
      "status": "pass",
      "endpoint": "/v1/chat/completions",
      "usage": {
        "promptTokens": 20,
        "completionTokens": 1,
        "reasoningTokens": 0
      }
    }
  ],
  "summary": {
    "modelCount": 3,
    "protocolCount": 3,
    "skippedCount": 0,
    "byProtocol": {
      "openai-chat": {
        "pass": 3,
        "fail": 0,
        "skip": 0,
        "avgLatencyMs": 1200
      }
    },
    "byModel": {
      "qwen3.5-flash": {
        "pass": 3,
        "fail": 0,
        "skip": 0,
        "avgLatencyMs": 1400
      }
    }
  }
}
```

`resolvedModel` is optional. It is present only when the provider response reports a different model from the requested model. Treat it as a gateway alias or routing signal.

Known matrix protocol IDs:

- `openai-chat`
- `openai-stream`
- `openai-tools`
- `openai-responses`
- `anthropic-messages`
- `gemini-generate`

Raw audit suites wrap discovery, matrix, and optional human-facing analysis. Agent integrations should prefer `--agent` instead of depending on this narrative section:

```json
{
  "schemaVersion": "0.2",
  "suite": "audit",
  "gateway": {
    "name": "Example Gateway",
    "baseUrl": "https://api.example.com",
    "family": "unknown"
  },
  "language": "en",
  "requestCount": 9,
  "auditPlan": [
    {
      "id": "gpt-5.4-mini",
      "label": "OpenAI-compatible candidate",
      "protocols": ["openai-responses", "openai-chat", "openai-stream", "openai-tools"],
      "groups": [],
      "endpoints": ["openai", "openai-responses"]
    }
  ],
  "discovery": {},
  "matrix": {},
  "analysis": {
    "health": {
      "status": "partial",
      "detail": "Some probes passed and some failed; review protocol or key-group findings.",
      "pass": 4,
      "fail": 2,
      "skip": 0
    },
    "findings": [
      {
        "severity": "info",
        "message": "No public pricing catalog was discovered; cost ranking is unavailable."
      }
    ],
    "recommendations": [
      "No pricing catalog was found. Prefer explicit model hints or specified coverage if cost control matters."
    ]
  }
}
```

`audit --plan-only` emits the same selected model/protocol plan without executing matrix probes:

```json
{
  "schemaVersion": "0.2",
  "suite": "audit-plan",
  "gateway": {
    "name": "Example Gateway",
    "baseUrl": "https://api.example.com",
    "family": "unknown"
  },
  "requestCount": 3,
  "discoverySummary": {
    "visibleModels": 12,
    "pricingCatalogModels": 120
  },
  "budget": {
    "maxModels": 3,
    "maxRequests": 8,
    "maxOutputTokens": 64,
    "plannedMatrixRequests": 6
  },
  "auditPlan": []
}
```

Earlier compact shape:

```json
{
  "schemaVersion": "0.1",
  "gateway": {
    "name": "Example Gateway",
    "baseUrl": "https://api.example.com",
    "family": "new-api"
  },
  "run": {
    "suite": "agent",
    "startedAt": "2026-05-16T00:00:00.000Z",
    "finishedAt": "2026-05-16T00:00:10.000Z",
    "requestCount": 5,
    "modelCount": 3
  },
  "results": [
    {
      "id": "openai-tools",
      "status": "pass",
      "endpoint": "/v1/chat/completions",
      "model": "gpt-5.4-mini",
      "latencyMs": 2100,
      "usage": {
        "promptTokens": 25,
        "completionTokens": 5,
        "totalTokens": 30,
        "cachedTokens": 0,
        "cacheHitRatePct": 0
      },
      "signals": {
        "finishReason": "tool_calls",
        "toolName": "get_weather"
      }
    }
  ],
  "summary": {
    "agentCompatibility": "agent-client-compatible",
    "cacheHitRatePct": 94.38,
    "passCount": 4,
    "failCount": 1
  }
}
```

Guidelines:

- Store raw provider responses only when explicitly enabled.
- Never persist API keys or full authorization headers.
- Truncate error bodies.
- Keep enough raw usage detail to reprice later.
