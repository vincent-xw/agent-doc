# Core

`@agentkit-ai/core` 提供工具注册表和 Agent 调用入口。如果你使用 [快速开始](/guide/getting-started)中的 SQLite 运行时，它已经为你准备好了 `tools` 和 `harness`。需要自己组合会话存储与模型客户端时，可以直接使用 Core。

## 注册服务端工具

用 `createToolRegistry()` 创建注册表，再用 `register()` 加入工具。每个工具都要说明名称、执行位置，以及输入和输出的 Zod schema。

```js
import { createToolRegistry } from '@agentkit-ai/core'
import { z } from 'zod'

// tools 保存这个 Agent 可以调用的工具。
const tools = createToolRegistry()

tools.register({
  name: 'get_weather',
  description: '查询城市当前气温，单位为摄氏度',
  execution: 'server',
  input: z.object({ city: z.string() }),
  output: z.object({ temperature: z.number() }),
  // 这里返回固定演示数据；在你的项目里可以改为调用天气服务。
  execute: async ({ city }) => ({ temperature: city === '杭州' ? 22 : 18 }),
})
```

`execution: 'server'` 表示工具在你的 Node.js 服务中执行。`description` 帮助模型判断何时使用它。输入和输出 schema 会校验传入值及执行结果。

## 创建并调用 Agent

下面的代码接在上一个代码块之后。运行前，先在服务端设置 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL`。地址与模型名称由你的 OpenAI 兼容服务商提供；缺少配置时示例会直接报错。

```js
import { createAgentHarness, createLlmClient, createMemorySessionStore } from '@agentkit-ai/core'

// 从服务端环境变量读取模型配置，不在代码中保存密钥。
const apiKey = process.env.LLM_API_KEY
const baseUrl = process.env.LLM_BASE_URL
const model = process.env.LLM_MODEL
if (!apiKey || !baseUrl || !model) {
  throw new Error('请先设置 LLM_API_KEY、LLM_BASE_URL 和 LLM_MODEL')
}

// llm 负责请求模型；sessions 在当前进程中保存会话。
const llm = createLlmClient({ apiKey, baseUrl, model })
const sessions = createMemorySessionStore()

// tools 是上一步创建的注册表；maxSteps 限制一次调用的最大处理步数。
const harness = createAgentHarness({ llm, sessions, tools, maxSteps: 10 })

// 相同的 sessionId 会沿用这段对话；context 可传入本次请求的业务上下文。
const result = await harness.run({
  sessionId: 'weather-session',
  input: '杭州现在多少度？',
  context: {},
})
console.log(result)
```

`harness.run()` 的 `sessionId` 用来识别会话，`input` 是用户的问题，`context` 是这次调用提供的上下文。常见返回值是 `{ type: 'final', output: ... }`，其中 `output` 是最终回答。如果注册了需要其他设备执行的远端工具，也可能得到 `{ type: 'pending_tool_calls', calls: [...] }`，由调用方完成这些工具调用后再继续。启用分步模式时还可能返回 `step_done`。

示例中的 `createMemorySessionStore()` 只保存当前进程内的对话。如果希望服务重启后继续会话，可使用 [SQLite 适配器](/packages/adapter-sqlite)。
