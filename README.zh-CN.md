# GatewayCheck

[![npm version](https://img.shields.io/npm/v/gatewaycheck.svg)](https://www.npmjs.com/package/gatewaycheck)
[![CI](https://github.com/CcCalana/gatewaycheck/actions/workflows/ci.yml/badge.svg)](https://github.com/CcCalana/gatewaycheck/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/gatewaycheck.svg)](LICENSE)

[English README](README.md)

GatewayCheck 是一个面向 AI 中转站、网关和模型代理的低成本诊断 CLI。它会检查网关是否可访问、哪些 API 协议可用、哪些模型可见，以及路由、权限、usage 字段和延迟信号是否足够可信。

GatewayCheck 适合在正式使用某个中转站前快速做一次安全、低成本、可复现的检查。

## 快速开始

运行 GatewayCheck：

```bash
npx gatewaycheck
```

第一屏会让用户选择安装/使用模式：

```text
1. Agent mode: install Skill + CLI (recommended)
2. Agent prompt only: generate an instruction for Codex, Claude Code, Cursor, or another agent
3. CLI mode: run a guided audit in this terminal
4. Command reference
```

推荐的 agent 自动测评流程：

```bash
npx gatewaycheck install
npx gatewaycheck prompt https://api.example.com
```

把生成的提示词粘贴给 Codex、Claude Code、Cursor 或其他 coding agent。agent 可以使用 GatewayCheck skill 规划测评、运行 GatewayCheck、控制请求预算并解释报告。

直接使用 CLI 引导流程：

```bash
npx gatewaycheck https://api.example.com
```

如果没有设置 `GATEWAY_API_KEY`，GatewayCheck 会提示你为本次运行粘贴 key。这个 key 不会写入配置文件，也不会出现在报告里。

如果经常使用，可以把网关 API key 放进环境变量。

Windows PowerShell:

```powershell
$env:GATEWAY_API_KEY="sk-..."
```

macOS / Linux:

```bash
export GATEWAY_API_KEY="sk-..."
```

引导式审计会：

- 先发现网关元数据
- 预览将要测试的模型和协议
- 在执行消耗额度的矩阵探针前询问确认
- 输出 Markdown 报告

如果你想跳过交互：

```bash
npx gatewaycheck audit https://api.example.com --preset smart --yes
```

同时保存 Markdown 和 JSON：

```bash
npx gatewaycheck audit https://api.example.com \
  --preset smart \
  --yes \
  --md reports/audit.md \
  --out reports/audit.json
```

## 检查内容

GatewayCheck 会向你提供的网关发送少量可复现探针。

| 范围 | 检查项 |
|---|---|
| Discovery | `/api/status`、`/api/pricing`、`/v1/models` |
| OpenAI 兼容 Chat | `/v1/chat/completions` |
| 流式输出 | SSE 事件、`[DONE]`、TTFT、chunk 间隔 |
| 工具调用 | 强制 function call 和 JSON 参数 |
| Responses API | `/v1/responses` smoke probe |
| Anthropic 兼容 API | `/v1/messages` smoke probe |
| Gemini 原生 API | `generateContent` smoke probe |
| 路由透明度 | 请求模型和返回模型是否一致 |
| Usage 元数据 | prompt、completion、cached、reasoning tokens |
| 权限限制 | key 分组、平台路由、协议权限 |

GatewayCheck 不是模型质量排行榜。它关注的是中转站兼容性、成本控制和透明度。

## 安装

一次性使用：

```bash
npx gatewaycheck https://api.example.com
```

全局安装：

```bash
npm install -g gatewaycheck
gatewaycheck https://api.example.com
```

要求：

- Node.js 20+
- HTTPS 网关地址
- 保存在环境变量中的 API key

GatewayCheck 会拒绝 `--api-key`、`--key` 这类裸 key 参数。

## 常见用法

### 先预览，不消耗矩阵额度

```bash
npx gatewaycheck audit https://api.example.com --plan-only
```

### 指定报告语言

```bash
npx gatewaycheck audit https://api.example.com --lang zh --yes
```

支持：`auto`、`en`、`zh`。

### 使用其他 key 环境变量

```powershell
$env:PACKY_API_KEY="sk-..."
npx gatewaycheck audit https://api.example.com --key-env PACKY_API_KEY --yes
```

一次性检查也可以不提前配置环境变量。变量缺失时，GatewayCheck 会安全提示输入 key。

### 提供模型提示

当 `/v1/models` 或 `/api/pricing` 信息不完整时，可以手动提供模型提示。

```bash
npx gatewaycheck audit https://api.example.com \
  --openai-model gpt-5.4-mini \
  --claude-model claude-sonnet-4-5 \
  --gemini-model gemini-2.5-flash \
  --yes
```

### 跑指定矩阵

创建本地配置：

```bash
gatewaycheck init
```

编辑 `gatewaycheck.local.json` 后运行：

```bash
gatewaycheck matrix gatewaycheck.local.json --yes --out reports/matrix.json
```

## 预算档位

| Preset | 适用场景 | 默认范围 |
|---|---|---|
| `quick` | 最低成本连通性检查 | 1 个代表模型，最多 4 个矩阵请求，32 max output tokens |
| `smart` | 推荐默认模式 | 3 个代表模型，最多 8 个矩阵请求，64 max output tokens |
| `broad` | 更宽的兼容性检查 | 6 个代表模型，最多 18 个矩阵请求，96 max output tokens |

需要时可以手动覆盖预算：

```bash
npx gatewaycheck audit https://api.example.com \
  --preset quick \
  --max-requests 4 \
  --max-tokens 32 \
  --yes
```

## 命令参考

| 命令 | 作用 |
|---|---|
| `gatewaycheck` | 打开安装/使用模式菜单 |
| `gatewaycheck install` | 安装 Skill + CLI，并显示 agent 使用指引 |
| `gatewaycheck <url>` | 对指定网关启动 CLI-only 引导式审计 |
| `gatewaycheck check <url>` | 同 CLI-only 引导式审计 |
| `gatewaycheck prompt <url>` | 输出可直接交给 agent 的测评提示词 |
| `gatewaycheck audit <url>` | 运行完整审计 |
| `gatewaycheck discover <url>` | 查看公开元数据和可见模型 |
| `gatewaycheck matrix <config>` | 运行配置中的模型/协议探针 |
| `gatewaycheck agent <config>` | 测试 agent-client 协议支持 |
| `gatewaycheck stream <config>` | 测试流式传输 |
| `gatewaycheck cache <config>` | 测试 prompt cache 信号 |
| `gatewaycheck init` | 创建 `gatewaycheck.local.json` |
| `gatewaycheck skill` | 显示 Codex skill 安装说明 |
| `gatewaycheck skill --install` | 安装随包附带的 Codex skill |
| `gatewaycheck doctor` | 检查本地发布准备度 |

常用参数：

| 参数 | 说明 |
|---|---|
| `--key-env <name>` | 保存 API key 的环境变量名 |
| `--preset quick\|smart\|broad` | 请求和 token 预算档位 |
| `--interactive` | 在选择审计覆盖范围前询问用户 |
| `--plan-only` | 只展示审计计划，不执行矩阵探针 |
| `--lang auto\|en\|zh` | Markdown 报告语言 |
| `--model <id>` | 默认 OpenAI 兼容模型提示 |
| `--openai-model <id>` | OpenAI 兼容模型提示 |
| `--claude-model <id>` | Anthropic 兼容模型提示 |
| `--gemini-model <id>` | Gemini 兼容模型提示 |
| `--protocols <list>` | matrix 使用的协议列表，逗号分隔 |
| `--max-models <n>` | audit planner 模型数量上限 |
| `--max-requests <n>` | 矩阵请求数量预算 |
| `--max-tokens <n>` | 每个 probe 的输出 token 上限 |
| `--md <path>` | 保存 Markdown 报告 |
| `--out <path>` | 保存 JSON 报告 |
| `--json` | 输出 JSON 到 stdout |
| `--yes` | 确认执行消耗额度的探针 |

## 报告内容

审计报告会汇总：

- 整体健康状态
- discovery 元数据
- 可见模型数量
- 价格目录可用性
- 选中的模型/协议计划
- pass/fail 矩阵
- 延迟和 TTFT
- token usage 字段
- 模型别名或路由变化
- key 分组和协议权限失败
- 建议的下一步动作

可参考 [examples/redacted-audit.md](examples/redacted-audit.md) 查看脱敏报告样例。

## 安全与隐私

GatewayCheck 是本地优先工具。

- 没有托管后端。
- 不收集 key、网关地址、报告、提示词、模型列表或 usage 数据。
- API key 只从环境变量读取。
- API key 只发送给你提供的网关地址。
- 拒绝裸 key CLI 参数。
- 报告只会写入你指定的本地路径，或输出到本地终端。
- `.env`、`.local` 配置、`reports/` 和 npm cache 文件默认被 git 忽略。
- 错误文本会对常见 secret 模式做脱敏。

如果 key 曾经出现在聊天、issue 或终端记录中，请立即轮换。

## Codex Skill

Codex skill 位于 [skills/gatewaycheck/SKILL.md](skills/gatewaycheck/SKILL.md)。当你希望智能体选择预算、判断测代表模型还是指定模型、运行 CLI 并解释报告时，可以使用它。

从 npm 包安装 skill，并显示 agent 下一步指引：

```bash
npx gatewaycheck install
```

覆盖已有本地副本：

```bash
npx gatewaycheck skill --install --force
```

安装后重启 Codex 或重新加载 TUI 会话，让它发现新 skill。

生成可直接交给 agent 的指令：

```bash
npx gatewaycheck prompt https://api.example.com
```

CLI 是探针执行和报告生成的权威入口。

## 开发

克隆并测试：

```bash
git clone https://github.com/CcCalana/gatewaycheck.git
cd gatewaycheck
npm test
```

运行本地 CLI：

```bash
npm run gatewaycheck -- help
```

检查包准备度：

```bash
npm run doctor
npm run pack:dry-run
```

## License

MIT。详见 [LICENSE](LICENSE)。
