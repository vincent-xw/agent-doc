# API 参考

本页按包列出三个基础包的公开 API。所有导出都从包根导入：

```js
import { createToolRegistry } from '@agentkit-ai/core'
import { createSqliteAgentRuntime } from '@agentkit-ai/adapter-sqlite'
import { createAgentBff } from '@agentkit-ai/bff-hono'
```

签名使用 TypeScript 记法，`?` 表示可选参数。想先看它们怎么串成完整应用，参见[示例应用](/demo/)；想按场景阅读，参见 [Core](/packages/core)、[SQLite 适配器](/packages/adapter-sqlite)、[Hono BFF](/packages/bff-hono) 三个指南页。

## 总览

| 包 | 提供 | 主要导出 |
| --- | --- | --- |
| `@agentkit-ai/core` | 工具注册表、受限 harness、LLM 客户端、提示词与上下文管理 | `createToolRegistry` · `createAgentHarness` · `createLlmClient` · `createPromptRegistry` |
| `@agentkit-ai/adapter-sqlite` | SQLite 会话存储与 AES-256-GCM 密钥库，并组装出可直接使用的运行时 | `createSqliteAgentRuntime`，以及三个可单独使用的工厂 |
| `@agentkit-ai/bff-hono` | 把 harness 接到 Hono 路由，并在请求进入 Agent 前鉴权 | `createAgentBff` |

密钥永远留在服务端：Agent 调用和密钥库都在你的 Node.js 服务里，浏览器只与 BFF 通信。`@agentkit-ai/core` 依赖 `zod` 3.x，用它声明工具的输入输出；`@agentkit-ai/adapter-sqlite` 使用内置的 `node:sqlite`，需要 **Node.js 22.13 或更高版本**。

---

## `@agentkit-ai/core`

### 常量

| 导出 | 值 | 说明 |
| --- | --- | --- |
| `AGENT_KIT_VERSION` | `"1.0.0"` | 当前发布版本。 |

### 工具注册表

```ts
function createToolRegistry(): ToolRegistry
```

只接受显式注册的工具，模型无法调用任意名称。内存实现：同名工具后注册会覆盖先注册项，应避免重名。

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `register` | `(definition: ToolDefinition) => void` | 注册工具。 |
| `unregister` | `(name: string) => void` | 注销工具，后续模型请求不再看到它。 |
| `get` | `(name: string) => ToolDefinition \| undefined` | 按名取工具。 |
| `list` | `() => ToolDefinition[]` | 枚举已注册工具，供构造发给模型的声明。 |

**`ToolDefinition`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 工具名，模型据此调用。 |
| `execution` | `'server' \| 'remote'` | `server` 在你的服务里执行；`remote` 交给远端 Tool Host。 |
| `description` | `string?` | 供模型理解用途，随 JSON Schema 一起发给模型。 |
| `input` | `z.ZodType<I>` | 输入 schema，校验模型传入的值。 |
| `output` | `z.ZodType<O>` | 输出 schema，校验执行结果。 |
| `timeoutMs` | `number?` | 单次执行超时；未设置时用 harness 的默认值（默认 30 秒）。 |
| `execute` | `(input: I, context: ToolExecutionContext) => Promise<O>` | `server` 工具的执行函数。 |

**`ToolExecutionContext`**：`signal: AbortSignal`（透传取消信号）、`sessionId?: string`、`callId?: string`（与 tool 消息的 `callId` 对应）、`reportProgress?: (progress: ToolProgress) => void`。进度只用于界面和诊断，不会自动进入 LLM 上下文。

### 提示词注册表

```ts
function createPromptRegistry(): PromptRegistry
```

以 `name@version` 注册系统提示词及可选的输出协议。**第一个注册的提示词会成为默认提示词**，harness 未指定 `promptName` 时使用它。同名同版本重复注册会直接报错（`PROMPT_ALREADY_REGISTERED`），避免提示词被静默覆盖。

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `register` | `(spec: { name, version, prompt, protocol? }) => void` | `protocol` 是可选的 Zod schema，用于校验模型输出结构。 |
| `get` | `(name: string, version: string) => RegisteredPrompt \| undefined` | 按名与版本取。 |
| `getByName` | `(name: string) => RegisteredPrompt \| undefined` | 忽略版本按名取；同名多版本时返回最后注册的。 |
| `getDefault` | `() => RegisteredPrompt \| undefined` | 取默认提示词。 |

### Agent 调用入口

```ts
function createAgentHarness(deps: AgentHarnessDependencies): AgentHarness
```

执行「模型 → 工具调用 → 工具结果 → 模型」的循环，受最大步数约束。

**`AgentHarnessDependencies`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `llm` | `LlmClient` | 模型客户端。 |
| `sessions` | `SessionStore` | 会话存储。 |
| `tools` | `ToolRegistry` | 工具注册表。 |
| `maxSteps` | `number` | 最大步数上限。 |
| `prompts` | `PromptRegistry?` | 提示词注册表。 |
| `audit` | `AuditLogger?` | 审计日志。 |
| `context` | `ContextManager?` | 上下文管理器，提供历史裁剪；未注入时发送完整历史。 |
| `pendingCalls` | `PendingCallStore?` | 挂起调用存储；未注入时用进程内实现，进程重启即丢。 |
| `toolTimeoutMs` | `number?` | 服务端工具默认执行超时，默认 30 秒。 |

**`AgentHarness`**

```ts
harness.run(request: {
  sessionId: string
  input: string
  context: Record<string, unknown>
  signal?: AbortSignal
  promptName?: string
  skipTools?: boolean
  allowedToolNames?: string[]
  maxSteps?: number
  toolExecution?: { execute(request: HarnessToolExecutionRequest): Promise<unknown> }
  stepMode?: boolean
  failureFallback?: unknown
}): Promise<HarnessResult>
```

| 参数 | 说明 |
| --- | --- |
| `sessionId` | 标识会话；相同 id 会沿用同一段对话。 |
| `input` | 本次用户输入。 |
| `context` | 本次请求的业务上下文；没有额外信息时传 `{}`。 |
| `signal` | 取消正在等待的模型请求。 |
| `promptName` | 指定使用哪个已注册提示词；省略时用默认提示词。 |
| `skipTools` | 不发 `tools` 字段，模型只能输出文本。用于计划阶段。 |
| `allowedToolNames` | 请求级工具白名单；传空数组表示本次不允许调用任何工具。 |
| `maxSteps` | 请求级步数预算，正整数收紧宿主上限；`0` 表示不设步数上限（仍受超时与取消控制）。 |
| `stepMode` | 分步模式：每执行完一轮 server 工具即返回 `step_done`，由调用方推进。 |
| `failureFallback` | 收口补全自身失败时的兜底输出。 |

另外两个方法：

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `resume` | `(request: { sessionId, callId, output, signal?, failureFallback? }) => Promise<HarnessResult>` | 回填远端 Tool Host 的执行结果并继续循环。 |
| `continue` | `(request: { sessionId, context?, input?, promptName?, allowedToolNames?, signal?, failureFallback? }) => Promise<HarnessResult>` | 分步模式下推进下一步。`input` 可选，提供时作为中途注入的用户消息。 |

**`HarnessResult`** 有三种形态：

```ts
| { type: 'final'; output: unknown; reasoning?: string }
| { type: 'pending_tool_calls'; calls: Array<{ callId: string; toolName: string; input: unknown }> }
| { type: 'step_done'; notices?: HarnessNotice[] }
```

`final` 是最终回答；`pending_tool_calls` 是需要远端 Tool Host 执行的挂起调用，完成后再用 `resume` 继续。注意 `run()` 返回的是完整结果，**没有流式接口**——流式只存在于 `createLlmClient` 的 `onDelta` 回调（见下）。

辅助导出 `looksLikeToolCallMarkup(output: unknown): boolean` 用于识别模型把工具调用语法当正文输出的情况。

### LLM 客户端

```ts
function createLlmClient(config: LlmClientConfig): LlmClient
```

创建 OpenAI Chat Completions 兼容的 HTTP 客户端，把错误统一标准化为 `AgentKitError`。

| 配置 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | `string` | — | 模型服务密钥。 |
| `baseUrl` | `string` | — | OpenAI 兼容端点地址。 |
| `model` | `string` | — | 模型名称。 |
| `provider` | `'openai-compatible' \| 'opencode-go'?` | OpenAI 兼容 | 服务商协议。 |
| `reasoningEffort` | `string?` | 不发送 | 模型允许的思考强度。 |
| `timeoutMs` | `number?` | `30000` | 单次请求超时。 |
| `maxRetries` | `number?` | `3` | 最大重试次数（0–5）。只重试网络错误与 5xx/429，不重试 4xx 参数错误。 |
| `trace` | `(event: LlmTraceEvent) => void?` | — | 调试钩子，会输出 Prompt 正文与模型原文。**生产环境不应开启。** |
| `onDelta` | `(delta: LlmDelta) => void?` | — | 提供时以 `stream: true` 调用端点，每收到增量回调一次。 |

`LlmDelta` 的字段：`content?`、`reasoning?`，以及由运行时注入的 `sessionId?`（带 `<subject>:` 前缀，见 [Hono BFF](#会话-id-会被加上前缀)）和 `turnId?`（同一次补全内相同、跨次不同，前端据此分轮渲染）。回调只用于实时展示，最终结果仍由 `complete()` 的返回值交付。

### 会话与上下文

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `createMemorySessionStore` | `() => SessionStore` | 内存会话存储，仅用于测试与无持久化场景；生产环境请用 SQLite 适配器。 |
| `createContextManager` | `(options: { maxMessages: number }) => ContextManager` | 内存上下文管理器，超过 `maxMessages` 时按单元边界丢弃最旧内容并记录裁剪摘要。 |
| `createTokenContextManager` | `(options: TokenContextManagerOptions) => TokenContextManager` | 按 token 预算裁剪上下文，附带用量状态与强制压缩。 |

`SessionStore` 只有两个方法：`load(sessionId)` 与 `save(sessionId, messages)`。

`TokenContextManagerOptions`：`model`、`limit`、`highWatermark?`、`lowWatermark?`、`preserveRecentUnits?`、`summarizer?`。它在 `ContextManager` 之上增加 `onLlmTrace(event)`、`getStatus(sessionId)`、`sync(sessionId, messages)`、`forceCompress(sessionId, messages)`、`setSummarizer(summarizer)` 和 `setModel(model, limit)`。

`ContextStatus`：`model`、`limit`、`used`、`remaining`、`ratio`、`compressedCount`，以及可选的 `cacheHit`、`cacheMiss`、`lastUpdatedAt`。

`SessionMessage` 是会话消息的联合类型。`role` 为 `assistant` 的消息可带 `toolCalls?: ToolCall[]`，`role` 为 `tool` 的消息必带 `callId`。模型决定调用工具的那一轮，`content` 会是 `null`——渲染历史时要跳过，详见[示例应用](/demo/#会话历史怎么读)。

### JSON Schema 转换

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `toToolSchema` | `(tool: ToolDefinition) => ToolSchema` | 把工具的输入 schema 转成可发给模型的 JSON Schema 声明。 |
| `toToolSchemas` | `(tools: ToolDefinition[]) => ToolSchema[]` | 批量转换。 |

`ToolSchema`：`{ name: string; description?: string; parameters: Record<string, unknown> }`。

### 审计与日志

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `createConsoleAuditLogger` | `(options?: ConsoleAuditOptions) => AuditLogger` | 控制台审计。只记 requestId、模型、耗时、HTTP 状态、工具名与错误码，不记密钥、Prompt 正文、模型原文与业务上下文。 |
| `logBoundaryError` | `(audit: AuditLogger \| undefined, requestId: string, errorCode: string, durationMs?: number, sessionId?: string) => void` | 单独记录 harness 之外的边界异常。 |
| `createLlmVerboseLogger` | `(options?: VerboseLogOptions) => (event: LlmTraceEvent) => void` | 打印单次 LLM 调用的完整输入输出，供排障。会输出 Prompt 正文与模型原文，但不会输出 API Key。**生产环境不应开启。** |

`ConsoleAuditOptions`：`enabled?`、`prefix?`、`sink?`。`VerboseLogOptions`：`enabled?`、`prefix?`、`sink?`。

`AuditEvent`：`requestId`、`sessionId?`、`model?`、`durationMs`、`httpStatus?`、`toolName?`、`errorCode?`。

### Token 与上下文估算

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `estimateTokens` | `(text: string) => number` | 估算一段文本的 token 数。 |
| `estimateMessages` | `(messages: SessionMessage[]) => number` | 估算一组消息的 token 数。 |
| `applyUsageCorrection` | `(estimated: number, usage?: LlmUsage) => number` | 用服务商上报的真实用量校准估算值。 |
| `resolveContextLimit` | `(model: string, envLimit?: string) => number` | 解析模型的上下文上限。 |
| `DEFAULT_CONTEXT_LIMIT` | `256000` | 默认上下文上限。 |
| `compressMessages` | `(messages, options, summarizer?, sessionId?) => Promise<CompressResult>` | 按水位压缩消息，返回 `{ messages, summary?, compressedCount }`。 |

### 错误

```ts
class AgentKitError extends Error {
  readonly code: AgentKitErrorCode
  constructor(code: AgentKitErrorCode, message: string, options?: { cause?: unknown })
}
```

所有可预期失败都抛带 `code` 的 `AgentKitError`。**判断分支请用 `code`，不要匹配错误文案。** 完整错误码：

| 错误码 | 含义 |
| --- | --- |
| `SECRET_NOT_CONFIGURED` | 主密钥格式不对、未配置 LLM Secret，或密钥版本不匹配。 |
| `TOOL_NOT_REGISTERED` | 模型调用了未注册的工具。 |
| `TOOL_EXECUTOR_MISSING` | 工具声明为 `server` 但没有 `execute`。 |
| `HARNESS_STEP_LIMIT` | 工具调用超过最大步数。 |
| `TOOL_INPUT_INVALID` / `TOOL_OUTPUT_INVALID` | 输入或输出未通过 schema 校验。 |
| `TOOL_EXECUTION_TIMEOUT` / `TOOL_EXECUTION_FAILED` / `TOOL_EXECUTION_ABORTED` | 工具执行超时、失败或被取消。 |
| `TOOL_EXECUTION_UNCERTAIN` | 工具执行结果不确定（例如超时后无法判断是否已产生副作用）。 |
| `TOOL_SCHEMA_UNSUPPORTED` | 工具的 Zod schema 无法转为 JSON Schema。 |
| `LLM_RESPONSE_INVALID` | 模型响应无法解析。 |
| `LLM_OUTPUT_PROTOCOL_INVALID` | 模型输出不符合提示词声明的输出协议。 |
| `PENDING_CALL_NOT_FOUND` | 回填时找不到对应的挂起调用。 |
| `PROMPT_ALREADY_REGISTERED` | 同名同版本提示词重复注册。 |
| `PROMPT_NOT_FOUND` | 指定的提示词不存在。 |

---

## `@agentkit-ai/adapter-sqlite`

### 组装运行时

```ts
function createSqliteAgentRuntime(options: {
  database: DatabaseSync
  masterKey: string
  maxSteps?: number
  prompts?: PromptRegistry
  toolTimeoutMs?: number
  audit?: AuditLogger
  contextManager?: ContextManager & { onLlmTrace?: (event: LlmTraceEvent) => void }
  llmTrace?: (event: LlmTraceEvent) => void
  llmDelta?: (delta: LlmDelta) => void
  llmMaxRetries?: number
  llmTimeoutMs?: number
  llmProvider?: LlmProvider
}): {
  secrets: {
    put(secret: LlmSecret): Promise<void>
    get(): Promise<LlmSecret>
    delete(): void
  }
  sessions: {
    save(sessionId: string, messages: SessionMessage[]): Promise<void>
    load(sessionId: string): Promise<SessionMessage[]>
  }
  tools: ToolRegistry
  pendingCalls: PendingCallStore
  harness: AgentHarness
  database: DatabaseSync
}
```

这是最常用的入口：一次装配好密钥库、会话存储、挂起调用存储、工具注册表和 harness。`database` 是 `node:sqlite` 的 `DatabaseSync` 实例，需要 **Node.js 22.13+**。

| 选项 | 说明 |
| --- | --- |
| `database` | 已打开的 SQLite 数据库。 |
| `masterKey` | 32 字节值的 base64url 编码；必须与加密时一致。 |
| `maxSteps` | 传给 harness 的最大步数。 |
| `prompts` | 提示词注册表。 |
| `toolTimeoutMs` | 服务端工具默认执行超时。 |
| `audit` | 审计日志。 |
| `contextManager` | 上下文管理器；选择性地接收 LLM 追踪事件。 |
| `llmTrace` | LLM 调用级追踪，配合 `createLlmVerboseLogger` 使用。 |
| `llmDelta` | LLM 流式增量回调，提供时启用 `stream: true`。 |
| `llmMaxRetries` / `llmTimeoutMs` / `llmProvider` | 透传给 `createLlmClient`。 |

返回的 `secrets` 有 `put(secret)`、`get()`、`delete()`；`sessions` 有 `save(sessionId, messages)`、`load(sessionId)`。

启动时 `createSqliteSecretProvider` 会立即校验 `masterKey`：不是 32 字节的 base64url 值就抛 `SECRET_NOT_CONFIGURED`。此外 `get()` 在两种情况下也会抛同一个错误码：SQLite 里还没有写入过密钥，或密文的密钥版本与当前主密钥不匹配（换了主密钥）。

### 单独使用各部件

不需要完整运行时时，可以只用其中一部分：

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `createSqliteSecretProvider` | `(options: { database, masterKey, id? }) => { put, get, delete }` | AES-GCM 密钥库。SQLite 里只存密文与密钥版本，主密钥不落库。`id` 默认 `'default'`；模型档案用 `'llm:<id>'` 这类槽位名。 |
| `createSqliteSessionStore` | `(database: DatabaseSync) => { save, load }` | 会话存储。session 表与密钥表分离，避免业务上下文与密钥混存。 |
| `createSqlitePendingCallStore` | `(database: DatabaseSync) => PendingCallStore` | 挂起调用存储。进程重启后回填仍能关联，不依赖进程内存。 |

`createSqliteSecretProvider().delete()` 在槽位不存在时静默返回，便于幂等清理。

---

## `@agentkit-ai/bff-hono`

### 创建 BFF 路由

```ts
function createAgentBff(options: {
  harness: AgentHarness
  authenticate: (request: Request) => Promise<{ subject: string } | null>
  audit?: AuditLogger
}): Hono
```

返回一个 Hono 实例，挂到你的应用上即可。它本身不持有任何密钥——密钥、会话与 harness 都由你在服务端注入。

| 选项 | 说明 |
| --- | --- |
| `harness` | Agent 调用入口。 |
| `authenticate` | 每个请求进入 Agent 前调用。返回 `null` 表示认证失败，请求得到 HTTP 401；返回 `{ subject }` 则继续。 |
| `audit` | 审计日志。不注入时边界上的失败在服务端不留痕迹，排查「客户端报错但服务端什么都看不到」时会缺少线索。 |

`subject` 用于区分用户会话，**应对应真实、稳定的用户身份**。示例代码里的固定字符串只适合本地演示。

### 注册的接口

`createAgentBff` 只注册三个 POST 接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/agent/sessions/:sessionId/run` | 发起一次提问。JSON 体为 `{ input, context }`。 |
| POST | `/v1/agent/sessions/:sessionId/continue` | 分步模式下推进下一步。 |
| POST | `/v1/agent/sessions/:sessionId/tool-results/:callId` | 回填远端工具结果。 |

查询会话历史、推送流式事件都不在其中，需要自己补，做法见[示例应用](/demo/#会话历史怎么读)。

### 会话 id 会被加上前缀

三个接口都会在调用 harness 之前，把 URL 里的 `sessionId` 改写成 `<subject>:<sessionId>`：

```js
// bff-hono 实际传给 harness 的值
const scopedSessionId = `${identity.subject}:${req.param('sessionId')}`
```

这意味着**两件事**：直接按 URL 里的 id 去 `runtime.sessions.load()` 查不到记录，必须自己拼上前缀；`llmDelta` 回调里的 `sessionId` 也是带前缀的，推送给浏览器之前要还原。这是自己接会话历史时最容易踩的坑。

::: warning 守卫要放在外层应用上
不要把中间件直接加到 `createAgentBff` 返回的实例上。Hono 按注册顺序匹配，它内部注册的是具体路由，会先于之后添加的路径中间件响应，守卫就失效了（实测会漏出 `500 SECRET_NOT_CONFIGURED`，而不是预期的 `503`）。用一个外层 `Hono` 包住它、把守卫放在外层，才能先于子应用执行。示例见 `demo/src/server.mjs`。
:::
