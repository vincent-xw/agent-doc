# Hono BFF

`@agentkit-ai/bff-hono` 把 Agent 调用接入 Hono 路由，并在请求进入 Agent 前调用你的认证函数。它运行在 **Node.js 服务端**；浏览器只调用你的 BFF 接口，不接收模型 API Key。

先安装依赖：

```bash
npm install @agentkit-ai/bff-hono hono
```

## 挂载 Agent 路由

以下代码使用 [SQLite 适配器](/packages/adapter-sqlite)示例导出的 `runtime`。在服务端设置 `BFF_API_TOKEN`，然后把代码保存为 `server.mjs`。`.mjs` 会让 Node.js 按 ES 模块运行示例。

```js
import { Hono } from 'hono'
import { createAgentBff } from '@agentkit-ai/bff-hono'
import { runtime } from './runtime.mjs'

// BFF_API_TOKEN 是客户端访问 BFF 的演示凭据，不是模型 API Key。
const bffApiToken = process.env.BFF_API_TOKEN
if (!bffApiToken) throw new Error('请先设置 BFF_API_TOKEN')

// authenticate 验证每个请求；失败返回 null，成功返回当前用户的 subject。
const agentRoutes = createAgentBff({
  harness: runtime.harness,
  authenticate: async (request) => {
    // 比较请求中的 Bearer 凭据；启动时已确认 bffApiToken 存在。
    const authorization = request.headers.get('authorization')
    if (authorization !== `Bearer ${bffApiToken}`) return null

    // 这里只是演示用户；实际项目请从自己的登录系统取得真实用户 ID。
    return { subject: 'demo-user' }
  },
})

// 把 Agent 路由挂到应用根路径。
const app = new Hono()
app.route('/', agentRoutes)

export default app
```

`authenticate` 要替换成你项目自己的认证逻辑。返回的 `subject` 用于区分用户会话，所以应对应真实、稳定的用户身份。未通过认证的请求会得到 HTTP 401。

## 发送一次提问

挂载后，向 `POST /v1/agent/sessions/:sessionId/run` 发送 JSON。把 URL 中的 `:sessionId` 换成你的会话 ID：

```json
{
  "input": "你好，请帮我总结今天的工作",
  "context": {}
}
```

请求需要带上项目认证逻辑要求的凭据；上面的演示代码使用 `Authorization: Bearer <BFF_API_TOKEN>`。`input` 是用户的问题，`context` 是本次请求的业务信息，没有额外信息时传空对象即可。同一用户重复使用同一个 `sessionId`，即可继续这段对话。

模型服务的 `LLM_API_KEY` 和 `AGENT_KIT_MASTER_KEY` 始终保留在 BFF 服务端环境中，不要传给 HTTP 客户端。Cloudflare Pages 只托管本文档站点的静态文件；这些 Agent 示例运行在你的 Node.js 服务中。
