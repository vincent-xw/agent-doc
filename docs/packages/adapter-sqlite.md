# SQLite 适配器

`@agentkit-ai/adapter-sqlite` 可以把 Agent 的会话和模型配置保存在 SQLite 文件中。适合想让服务重启后继续使用同一段会话的 Node.js 应用。

下面的示例需要 **Node.js 22.13 或更高版本**。先安装依赖：

```bash
npm install @agentkit-ai/adapter-sqlite
```

## 准备服务端配置

你需要一个主密钥来保存模型配置。`AGENT_KIT_MASTER_KEY` 必须是 **32 字节值的 base64url 编码**。可以用 Node.js 生成：

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

把生成的值稳定保存在 BFF 服务端环境中。同一个 SQLite 文件后续仍要使用这把主密钥；请勿把它放进浏览器代码或提交到仓库。模型服务的 `LLM_API_KEY` 也只放在服务端环境中。

示例还会读取 `LLM_BASE_URL` 和 `LLM_MODEL`。这两个值由你使用的 OpenAI 兼容模型服务提供。

## 创建运行时

在 Node.js 服务端新建 `runtime.mjs`。示例使用 `.mjs` 扩展名，让 Node.js 按 ES 模块运行代码，包括顶层的 `await`。

```js
import { DatabaseSync } from 'node:sqlite'
import { createSqliteAgentRuntime } from '@agentkit-ai/adapter-sqlite'

// 从服务端环境读取主密钥和模型配置，缺少任何一项就停止启动。
const masterKey = process.env.AGENT_KIT_MASTER_KEY
const apiKey = process.env.LLM_API_KEY
const baseUrl = process.env.LLM_BASE_URL
const model = process.env.LLM_MODEL
if (!masterKey || !apiKey || !baseUrl || !model) {
  throw new Error('请先设置 AGENT_KIT_MASTER_KEY、LLM_API_KEY、LLM_BASE_URL 和 LLM_MODEL')
}

// database 指向保存会话与模型配置的本地 SQLite 文件。
const database = new DatabaseSync('agent-kit.sqlite')

// runtime 集中提供密钥、会话、待处理调用、工具注册表和 Agent 调用入口。
export const runtime = createSqliteAgentRuntime({ database, masterKey })

// 首次接入时写入模型配置；密钥始终留在 Node.js 服务端。
await runtime.secrets.put({ apiKey, baseUrl, model })
```

`runtime` 包含 `secrets`、`sessions`、`pendingCalls`、`tools` 和 `harness`。你可以通过 `runtime.tools.register(...)` 添加工具；直接提问时，调用 `runtime.harness.run(...)`：

```js
import { runtime } from './runtime.mjs'

// sessionId 标识这段对话；再次使用同一个值时会读取已保存的会话。
const result = await runtime.harness.run({
  sessionId: 'my-session',
  input: '你好，请介绍一下你能做什么',
  context: {},
})

console.log(result)
```

`context` 是本次调用提供的业务信息；没有额外信息时传空对象即可。如果你的应用通过 HTTP 接受提问，可以继续看 [Hono BFF](/packages/bff-hono)。
