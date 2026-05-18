# GatewayCheck

[English README](README.md)

GatewayCheck 是一个面向 AI 中转站 / 网关 / relay 服务的低成本审计工具，形态是 CLI + Codex Skill。

用户只需要提供网关地址和 API key 所在的环境变量，工具就会用一组小而可复现的探针回答这些实际问题：

- 这个网关是否能通过 HTTPS 安全访问？
- 是否暴露公开的状态、价格、模型元数据？
- OpenAI Chat、Responses、流式输出、工具调用、Anthropic Messages、Gemini native 是否可用？
- 是否存在模型分组、key 权限、平台路由限制？
- 请求模型是否被网关改写、别名化，或路由到其他上游模型？
- usage、cached tokens、reasoning tokens、延迟、TTFT、request id 等诊断字段是否足够透明？

默认目标不是做模型质量排行榜，而是用尽可能少的请求发现中转站在兼容性、权限、路由和透明度上的大问题。

## 为什么做这个

很多中转站看起来“能聊一句”，但这并不代表它适合真实使用。一个普通 chat 请求可能通过，但 stream、tools、Responses、Claude 原生接口、Gemini 原生接口、分组权限、usage 字段、模型别名都可能有问题。

GatewayCheck 把这件事做成一个受控的诊断漏斗：

1. 先做 discovery，尽量不消耗额度。
2. 只有用户显式确认后才跑消耗 key 的测试。
3. 默认只选代表模型和代表协议，不盲目全量扫。
4. 同时生成结构化 JSON 和人类可读的 Markdown 报告。
5. 不把裸 key 写进配置、日志或报告。

## 当前状态

这是一个早期轻量级项目，但已经可以真实审计网关。

已经支持：

- discovery、agent compatibility、prompt cache、stream、matrix、audit 等 CLI 命令。
- OpenAI-compatible Chat Completions。
- OpenAI-compatible SSE stream，记录 TTFT 和 SSE 完整性。
- OpenAI-compatible tools/function calling。
- OpenAI Responses API smoke test。
- Anthropic Messages API smoke test。
- Gemini native `generateContent` smoke test。
- New API 风格 `/api/pricing` 价格目录解析。
- 基于价格目录、可见模型、配置角色、模型名 hint 的自动 audit planning。
- 交互式 audit planning，并在正式消耗额度前二次确认预算。
- `audit --plan-only` 可以先预览模型 / 协议矩阵，不执行矩阵探针。
- Markdown 和 JSON 审计报告。
- `doctor` 维护者自检命令，用于发布前检查包结构。
- `skills/gatewaycheck` Codex Skill 工作流。

暂未支持：

- 真正的全模型穷举模式和逐项预算确认。
- 与平台控制台账单做自动对账。
- 长上下文、并发、质量评测等高级套件。
- Claude CLI / Claude Code 专用协议探针。

## 安装 / 运行

要求：

- Node.js 20+
- HTTPS 网关地址
- API key 存在环境变量中

推荐的一次性使用方式：

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset smart \
  --yes
```

全局安装：

```bash
npm install -g gatewaycheck
gatewaycheck audit --base-url https://api.example.com --key-env GATEWAY_API_KEY --preset smart --yes
```

源码运行，推荐与 Codex Skill 一起使用：

```bash
git clone <your-repo-url>
cd GatewayCheck
npm test
```

当前运行时没有额外 npm 依赖。

## 快速开始

先把 key 放到环境变量里。不要把裸 key 放进 CLI 参数，也不要写入 JSON 配置文件。

macOS / Linux:

```bash
export GATEWAY_API_KEY="sk-..."
```

Windows PowerShell:

```powershell
$env:GATEWAY_API_KEY="sk-..."
```

只用 base URL 跑一次推荐的 smart 审计：

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset smart \
  --yes \
  --out reports/example-audit.json \
  --md reports/example-audit.md
```

默认情况下，`audit` 会展示紧凑的 Markdown 报告；完整 JSON 只有在 `--out` 指定路径时落盘。需要把完整 JSON 打到 stdout 时再加 `--json`。

正式消耗矩阵请求前，可以先预览会测哪些模型和协议：

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset smart \
  --plan-only \
  --lang zh
```

需要时可以显式指定报告语言：

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --lang zh \
  --yes
```

## 预算档位

GatewayCheck 的默认设计是同时节省 API 额度和智能体上下文。

| Preset | 适用场景 | 默认范围 |
|---|---|---|
| `quick` | 最低成本连通性检查 | 1 个代表模型，最多 4 次请求，32 max output tokens |
| `smart` | 推荐默认模式 | 3 个代表模型，最多 8 次请求，64 max output tokens |
| `broad` | 更宽覆盖评估 | 6 个代表模型，最多 18 次请求，96 max output tokens |

可以手动覆盖预算：

```bash
npx gatewaycheck audit \
  --base-url https://api.example.com \
  --key-env GATEWAY_API_KEY \
  --preset quick \
  --max-requests 4 \
  --max-tokens 32 \
  --yes
```

## 如何选择模型

如果网关暴露 `/api/pricing`，GatewayCheck 会尽量使用价格元数据选择低成本代表模型。

如果没有价格元数据，工具会回退到：

- `/v1/models` 中可见的模型
- 用户配置的模型 hint
- 模型名 hint，例如 `gpt`、`codex`、`claude`、`gemini`、`deepseek`、`qwen`

可以直接在命令行提供模型 hint：

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

如果你想精确控制模型和协议矩阵，使用配置文件：

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

然后运行：

```bash
gatewaycheck matrix gatewaycheck.local.json --yes --out reports/matrix.json
```

## 命令

安装后或 `npx` 使用：

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

源码运行：

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

常用参数：

| 参数 | 说明 |
|---|---|
| `--base-url <url>` | 用网关地址临时构造配置 |
| `--key-env <name>` | 保存 API key 的环境变量名 |
| `--name <name>` | 报告里的网关名称 |
| `--model <id>` | 默认 OpenAI-compatible 模型 hint |
| `--openai-model <id>` | OpenAI-compatible 模型 hint |
| `--claude-model <id>` | Anthropic-compatible 模型 hint |
| `--gemini-model <id>` | Gemini-compatible 模型 hint |
| `--protocols <list>` | matrix 使用的协议列表，逗号分隔 |
| `--preset quick\|smart\|broad` | audit 预算档位 |
| `--interactive` | 在选择审计覆盖范围前询问用户 |
| `--plan-only` | 只展示审计计划，不执行矩阵探针 |
| `--lang auto\|en\|zh` | Markdown 报告语言 |
| `--max-models <n>` | audit planner 模型数量上限 |
| `--max-requests <n>` | 请求数量预算 |
| `--max-tokens <n>` | 每个 probe 的输出 token 上限 |
| `--out <path>` | 保存 JSON 报告 |
| `--md <path>` | 保存 Markdown 审计报告 |
| `--json` | 输出完整 JSON 到 stdout |
| `--yes` | 消耗 key 的套件必须显式确认 |

`--api-key`、`--key` 这类裸 key 参数会被拒绝。

## 支持的协议探针

| Protocol ID | Endpoint | 检查内容 |
|---|---|---|
| `openai-chat` | `/v1/chat/completions` | 基础非流式 chat |
| `openai-stream` | `/v1/chat/completions` | SSE、`[DONE]`、TTFT、chunk 指标 |
| `openai-tools` | `/v1/chat/completions` | 强制 function tool call 和 JSON 参数 |
| `openai-responses` | `/v1/responses` | Responses API 兼容性和可见输出 |
| `anthropic-messages` | `/v1/messages` | Anthropic Messages API 兼容性 |
| `gemini-generate` | `/v1beta/models/{model}:generateContent` | Gemini 原生生成接口 |

## 如何读报告

Audit 报告会包含：

- 整体健康状态
- discovery family
- 可见模型数量
- 是否有价格目录
- 被选择的模型 / 协议计划
- pass/fail 矩阵
- HTTP 状态和延迟
- token usage、cached tokens、reasoning tokens
- stream TTFT 和 SSE 完整性
- 模型别名或路由信号
- 权限、分组、平台、CLI-only 限制等发现
- 建议的下一步动作

常见结论：

- `No public pricing catalog was discovered`：没有公开价格表，工具无法证明哪个模型最便宜。
- `resolved to <model>`：请求模型可能是别名，或被网关路由到另一个上游模型。
- `does not allow /v1/messages dispatch`：当前 key 分组大概率不允许 Anthropic 原生接口。
- `platform is not gemini`：当前 key 分组不是 Gemini native 平台。
- `reasoning tokens`：推理模型可能需要更大的 max-token 预算，不能直接判定协议不兼容。

## Skill + CLI 工作流

推荐的产品形态是 Skill + CLI：

- CLI 通过 `npx` 或全局安装执行，保证测试过程稳定、可复现。
- Codex Skill 负责预算选择、询问用户要测指定模型还是扩大覆盖，并解释报告。

当你希望智能体帮你审计新网关时，使用 `skills/gatewaycheck/SKILL.md`：

- 先识别网关地址和 key 环境变量。
- 在 `quick`、`smart`、`broad` 之间选择合适预算。
- 当模型很多或价格目录缺失时，先问用户要测代表模型、指定模型，还是扩大覆盖。
- 解释失败原因，并建议下一步 probe。
- 避免把完整 JSON 倒进对话，减少上下文消耗。

推荐的人机协作流程：

1. 先跑 discovery。
2. 如果模型数量不大且价格目录可见，跑 `smart`。
3. 如果模型很多或没有价格目录，询问用户要测代表模型、指定模型还是更宽覆盖。
4. 没有用户明确确认，不跑全量模型。

## 隐私与数据处理

GatewayCheck 是本地优先工具。项目本身不会收集用户的 key、网关地址、报告、提示词、模型列表、usage 数据或任何其他用户信息。

- GatewayCheck 没有托管后端服务。
- 没有 telemetry、analytics endpoint、账号系统或远程报告上传。
- API key 只从环境变量读取，并且只作为 `Authorization` header 发送给用户配置的网关地址。
- 测试运行期间，请求只会发送到用户配置的网关。通过 `npx` 或 `npm` 安装时会从 npm registry 下载包，这与实际 benchmark 执行是两件事。
- JSON 和 Markdown 报告只会写入用户指定的本地路径，或输出到本地 stdout。
- 报告可能包含网关地址、模型名、HTTP 状态码、usage 元数据和脱敏后的错误信息。公开分享报告前请先自行检查。

可参考 [examples/redacted-audit.md](examples/redacted-audit.md) 了解适合分享的脱敏报告样例。

## 安全设计

GatewayCheck 有几条刻意的安全边界：

- 只允许 HTTPS 网关 URL。
- API key 只从环境变量读取。
- 拒绝裸 key CLI 参数。
- 拒绝在配置文件里保存裸 `apiKey`。
- `reports/`、`.local` 配置、`.env` 和日志默认被 `.gitignore` 忽略。
- 错误文本会对常见 secret 模式做脱敏。
- 消耗 key 的测试必须加 `--yes`。

如果 key 曾经被粘贴到聊天、issue、终端记录里，建议立即轮换。

## 项目结构

```text
packages/core        核心探针、planner、报告生成、HTTP client
packages/cli         本地 CLI 封装
configs/             示例配置
docs/                方法论、schema、路线图、研究记录
examples/            脱敏示例配置和报告
skills/              Codex skill 工作流
reports/             本地生成报告，默认不提交 git
```

## 开发

运行测试：

```bash
npm test
```

查看 CLI 帮助：

```bash
npm run gatewaycheck -- help
```

检查发布准备度：

```bash
npm run doctor
npm run pack:dry-run
```

维护者发布说明见 [docs/release-checklist.md](docs/release-checklist.md)。

创建本地配置：

```bash
npm run init
```

## 路线图

近期：

- 更安全的全模型模式，带供应商和协议预算确认。
- 更可读的评分、徽章和报告摘要。
- 可选的多轮延迟采样。
- Claude Code / Claude CLI 专用兼容性探针。

后续：

- 长上下文和 prompt cache benchmark profiles。
- 并发和限流测试。
- 账单对账辅助。
- 历史报告对比。
- Web dashboard。

## License

MIT。详见 [LICENSE](LICENSE)。
