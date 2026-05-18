# Platform Roadmap

See also [evaluation-expansion-plan.md](evaluation-expansion-plan.md) for the probe-level benchmark expansion plan.

## Phase 0: Local Foundation

- Zero-dependency core probes.
- CLI commands for discovery, agent compatibility, and cache.
- JSON report output.
- Skill draft for Codex-assisted benchmark runs.

## Public Roadmap

GatewayCheck stays focused on a local-first `npx` + Skill + CLI workflow:

- Packaging: provide one small npm package with the `gatewaycheck` binary and a verified package file list.
- Interaction: let users choose representative models, specified models, or broader coverage when a gateway exposes many models.
- Reporting: include health status, request/token budget summaries, protocol coverage, and remediation hints.
- Safety: keep key handling local, provide redacted examples, and document what report fields may be sensitive.
- Validation: use real gateway results to improve planner rules without adding heavyweight default probes.

## Phase 1: Private Dashboard

- Local-first web UI.
- Provider/key vault in local encrypted storage.
- Run history table.
- Cache hit charts.
- Agent compatibility matrix.

## Phase 2: Scheduled Benchmarking

- Job queue with request/token budgets.
- Time-of-day stability runs.
- Concurrent performance runs.
- Alerting on regression.

## Phase 3: Public/Shareable Reports

- Redacted report export.
- Relay comparison pages.
- Methodology transparency pages.
- Optional RelayRadar-compatible ranking export.

## Phase 4: Deeper Auditing

- Billing deduction reconciliation.
- Stream interruption tests.
- Context window limit tests.
- Model identity fingerprinting integration.
- Multi-region runners.
