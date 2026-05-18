# 调研经验总结

## 1. 先区分“仓库项目”和“线上部署”

以 OpenToken 为例，`github.com/opentoken-io/opentoken` 是旧的 tokenization/encryption API 项目，不是 LLM 网关。线上 `https://api.opentoken.io/` 返回的是 New API 风格前端和接口：

- `/api/status` 暴露 `system_name`、`docs_link`、`version`、`server_address`。
- `/api/pricing` 暴露模型、分组、支持端点和计费倍率。
- `/v1/models` 需要 key，返回实际可用模型集合。

所以测试平台必须把“开源仓库静态分析”和“线上接口行为”分开。

## 2. Agent 适配要测协议，不只测文本

之前实测 OpenToken 时，真正能说明 agent 适配的不是普通聊天成功，而是这些结果：

- OpenAI Chat Completions `tools` 返回 `finish_reason=tool_calls`。
- OpenAI Responses 返回 `object=response`。
- Responses API `tools` 返回 `output.type=function_call`。
- Anthropic `/v1/messages` 返回 Claude 原生 `message`。
- Anthropic `tools` 返回 `stop_reason=tool_use` 和 `content.type=tool_use`。
- `/v1/threads` 返回 404，说明它不是 Assistants/Threads 托管 runtime。

结论口径要谨慎：它可以是 “agent client compatible gateway”，但未必是 “agent runtime”。

## 3. Prompt cache 要用重复前缀实验

有效实验方法：

1. 选便宜模型，限制输出 tokens。
2. 构造稳定长前缀，连续发两次同样请求。
3. 读取 `usage.prompt_tokens_details.cached_tokens`、`usage.input_tokens_details.cached_tokens` 或 `prompt_cache_hit_tokens`。
4. 命中率 = `cached_tokens / prompt_tokens`。

实测经验：

- 简单长前缀：2354 prompt tokens，第二次 cached 1792，命中率 76.13%。
- 复杂 agent 指令包：3526 prompt tokens，第二次 cached 3328，命中率 94.38%。

稳定前缀越长，越容易形成高缓存命中。但 `total_tokens` 往往仍显示总 tokens，账单是否按缓存折扣结算要另测后台扣费。

## 4. 请求预算和 key 安全是产品基础

默认规则：

- key 只从环境变量读取。
- 输出永不回显 key。
- 有 key 的测试必须有请求数和 token 预算。
- 默认使用最便宜可用模型。
- 每个测试项都记录实际请求数、模型名、usage 和错误摘要。
