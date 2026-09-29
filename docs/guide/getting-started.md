# 快速开始

跟着本页，你会在 Node.js 服务端注册一个查询天气的工具，并让 Agent 回答一次问题。示例中的温度是固定演示数据；接入真实天气服务时，只需替换工具的执行函数。

## 安装

这个示例直接使用 `node:sqlite`，需要 Node.js 22.13 或更新版本。在你的项目里安装：

```sh
npm install @agentkit-ai/core @agentkit-ai/adapter-sqlite zod
```

## 配置模型

在终端设置以下环境变量。`LLM_BASE_URL` 和 `LLM_MODEL` 请填写你使用的 OpenAI 兼容服务商提供的 API 地址和模型名称。`LLM_API_KEY` 是该服务商的密钥。`AGENT_KIT_MASTER_KEY` 用来加密保存在 SQLite 中的模型配置，必须是 32 字节的 base64url 值。

可以用下面的命令生成主密钥：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

将生成的值与模型配置写入服务端环境变量。请勿把密钥提交到 Git，也不要放到浏览器代码里。

## 运行第一个 Agent

在项目根目录创建 `example.mjs`：

```js
import { DatabaseSync } from 'node:sqlite'
import { createSqliteAgentRuntime } from '@agentkit-ai/adapter-sqlite'
import { z } from 'zod'

// 从服务端环境变量读取主密钥和模型配置；缺少任一项就直接报错。
const masterKey = process.env.AGENT_KIT_MASTER_KEY
const apiKey = process.env.LLM_API_KEY
const baseUrl = process.env.LLM_BASE_URL
const model = process.env.LLM_MODEL
if (!masterKey || !apiKey || !baseUrl || !model) {
  throw new Error('请先设置 AGENT_KIT_MASTER_KEY、LLM_API_KEY、LLM_BASE_URL 和 LLM_MODEL')
}

// agent.db 是当前目录下的 SQLite 文件，用来保存会话和加密后的模型配置。
const database = new DatabaseSync('agent.db')
const runtime = createSqliteAgentRuntime({ database, masterKey })

// 将当前模型配置写入运行时使用的密钥存储。
await runtime.secrets.put({ apiKey, baseUrl, model })

// 工具只在服务端执行；输入是城市名，输出是摄氏温度。
runtime.tools.register({
  name: 'get_weather',
  description: '查询城市当前气温，单位为摄氏度',
  execution: 'server',
  input: z.object({ city: z.string() }),
  output: z.object({ temperature: z.number() }),
  // 演示数据：接入项目时，把这里替换为真实天气服务的调用。
  execute: async ({ city }) => ({ temperature: city === '杭州' ? 22 : 18 }),
})

// sessionId 标识这段对话；再次使用同一值时会继续已有会话。
const result = await runtime.harness.run({
  sessionId: 'first-session',
  input: '杭州现在多少度？',
  context: {},
})
console.log(result)
```

运行：

```sh
node example.mjs
```

模型回复会以 `{ type: 'final', output: ... }` 返回。实际回答由你配置的模型生成，因此文字可能不同。模型能否调用工具，也取决于所用服务是否支持工具调用。想进一步了解工具注册和调用结果，请继续阅读 [Core](/packages/core)。
