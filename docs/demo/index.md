# 示例应用

前面几页的代码是分散的片段。这一页介绍一个把它们串起来的完整应用，你可以直接跑起来，再对照着读源码。

示例在仓库的 `demo/` 目录下，是一个待办助手：Agent 通过工具读写 SQLite 里的真实待办数据。它演示的是一条真实可用的路径，而不是写死的演示数据。

## 它演示了什么

- **服务端工具读写真实数据**：三个工具直接操作 SQLite 里的待办，不是返回固定值。
- **会话持久化**：会话和模型配置都保存在 SQLite 中，重启服务后继续。
- **流式输出**：模型回复逐字出现在页面上。
- **会话历史**：刷新页面后恢复对话记录。
- **密钥不出服务端**：浏览器只和 BFF 通信，模型密钥留在 Node.js 进程里。

后两项在现有文档里没有涉及，示例把它们补上了。

## 运行

需要 **Node.js 22.13 或更高版本**。

```sh
cd demo
npm install
npm start
```

然后打开 <http://127.0.0.1:8790>。

**不配模型密钥也能启动**：待办功能完全可用，只有聊天会被禁用并给出提示。想看完整效果，把 `.env.example` 复制为 `.env`，填入 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL` 后重启。`AGENT_KIT_MASTER_KEY` 留空即可——首次启动会自动生成并写回 `.env`。

配好模型后可以这样试：

```text
帮我加一条待办：明天上午买牛奶
```

回复会逐字出现，中间夹着工具调用的提示条，右侧待办面板实时更新。

## 文件地图

```
demo/
├── src/
│   ├── server.mjs     装配：数据库 → 运行时 → 工具 → BFF → 静态文件
│   ├── config.mjs     读取 .env，首次启动自动生成主密钥
│   ├── auth.mjs       鉴权，以及会话 id 的 <subject>: 前缀规则
│   ├── todos.mjs      待办数据层
│   ├── tools.mjs      Agent 可调用的三个工具
│   ├── events.mjs     事件总线 + SSE 接口
│   └── prompts.mjs    系统提示词
└── public/            前端页面（原生 HTML/JS，无需构建）
```

对应到三个包：

| 文件 | 用到的包 |
| --- | --- |
| `server.mjs` | `createSqliteAgentRuntime`（SQLite 适配器）、`createAgentBff`（Hono BFF） |
| `server.mjs` | `createPromptRegistry`（Core） |
| `tools.mjs` | `zod`——注意必须是 3.x，Core 依赖 zod 3 |

## 流式输出怎么接

`@agentkit-ai/core` 的 `harness.run()` 返回的是完整结果，它没有流式接口。流式只存在于一个地方：创建运行时的 `llmDelta` 回调。

```js
const runtime = createSqliteAgentRuntime({
  database,
  masterKey,
  // 模型每生成一小段文本就会回调一次。
  llmDelta: (delta) => {
    // delta.sessionId 是带 <subject>: 前缀的，推给浏览器前要还原。
    bus.emit({ type: 'llm_delta', sessionId: toRawSessionId(delta.sessionId), content: delta.content })
  },
})
```

包只给回调，不给传输层——怎么把 `delta` 送到浏览器由你决定。示例用的是一个约 40 行的内存事件总线加上 SSE 接口，见 `src/events.mjs`。你也可以换成 WebSocket 或轮询。

浏览器用 `EventSource` 订阅。注意它**不能自定义请求头**，如果开启了鉴权，凭据要通过查询参数传入：

```js
const source = new EventSource(`/api/events?sessionId=${sessionId}&token=${token}`)
source.onmessage = (event) => {
  const payload = JSON.parse(event.data)
  if (payload.type === 'llm_delta') appendToken(payload.content)
}
```

## 会话历史怎么读

`bff-hono` 只注册了三个 POST 接口，没有查询历史的接口，需要自己补。关键是**会话 id 要加 `<subject>:` 前缀**：

```js
// bff-hono 在写入会话时，会把 sessionId 改写成 <subject>:<sessionId>，
// 所以直接查原始 id 是查不到的。
const messages = await runtime.sessions.load(`${subject}:${sessionId}`)
```

`messages` 是 `SessionMessage[]`，渲染时注意两种特殊情况：模型决定调用工具的那一轮，`content` 是 `null`，应当跳过；`role` 为 `tool` 的消息是工具执行记录。示例的做法见 `public/app.js` 的 `renderMessages()`。

## 工具调用的事件怎么来

Agent Kit 不会发出「工具开始执行」这类事件。示例在每个工具的 `execute` 里，用上下文提供的 `callId` 自己发：

```js
execute: async ({ title }, context) => {
  bus.emit({ type: 'tool_start', toolName: 'add_todo', callId: context.callId })
  const todo = todos.add(title)
  bus.emit({ type: 'tool_end', toolName: 'add_todo', callId: context.callId })
  return todo
}
```

`ToolExecutionContext` 还提供 `sessionId`、`signal` 和 `reportProgress`，长任务可以用后两者上报进度或响应中断。

## 两处与文档示例不同

示例中有两处刻意的差异，接入你自己的项目时按需选择：

1. **缺少模型配置时不报错退出，而是降级启动。** 快速开始和各包页面里的示例直接 `throw`，语义更简单；示例应用选择让服务起得来，这样 `npm install` 之后立刻能看到东西。
2. **自己解析 `.env`，而不是用 `--env-file`。** 因为主密钥需要由应用在首次运行时生成并写回文件，而 `--env-file` 在用户代码之前就读完了，没法把新生成的值交给后面的代码。

## 排查

**回复没有逐字出现。** 说明模型服务不支持流式返回。聊天仍然可用，只是整段出现。这与所用服务有关，和[快速开始](/guide/getting-started)里「模型能否调用工具取决于所用服务」是同一类限制。

**启动时报 `ExperimentalWarning: SQLite is an experimental feature`。** 这是 Node.js 对内置 `node:sqlite` 的常规提示，不影响使用。

完整的说明见仓库中的 `demo/README.md`。
