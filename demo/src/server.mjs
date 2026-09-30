// 这一行必须放在最前面：config.mjs 会在导入时读取 .env，
// 并可能在首次运行时生成 AGENT_KIT_MASTER_KEY 写回文件。
import { config } from './config.mjs'

import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createPromptRegistry } from '@agentkit-ai/core'
import { createSqliteAgentRuntime } from '@agentkit-ai/adapter-sqlite'
import { createAgentBff } from '@agentkit-ai/bff-hono'

import { createAuth } from './auth.mjs'
import { createTodoStore } from './todos.mjs'
import { createEventBus, mountEventRoutes } from './events.mjs'
import { createTodoTools } from './tools.mjs'
import { TODO_ASSISTANT_PROMPT } from './prompts.mjs'

const auth = createAuth({ apiToken: config.apiToken })
const bus = createEventBus()

// 打开 SQLite 文件，会话记录和待办都存在这里。
const database = new DatabaseSync(config.databasePath)
const todos = createTodoStore(database)

// 注册系统提示词。第一个注册的提示词会成为默认提示词。
const prompts = createPromptRegistry()
prompts.register({ name: 'todo-assistant', version: '1', prompt: TODO_ASSISTANT_PROMPT })

/**
 * 创建 Agent 运行时。
 *
 * llmDelta 是三个包提供的唯一流式入口——每生成一小段文本就会回调一次。
 * 包不负责把它送到浏览器，所以这里转发到自己的事件总线，再由 SSE 推给前端。
 * 回调里的 sessionId 是带 <subject>: 前缀的，推出去之前要还原。
 */
const runtime = createSqliteAgentRuntime({
  database,
  masterKey: config.masterKey,
  prompts,
  maxSteps: 10,
  llmDelta: (delta) => {
    if (!delta.sessionId) return
    bus.emit({
      type: 'llm_delta',
      sessionId: auth.toRawSessionId(delta.sessionId),
      turnId: delta.turnId,
      content: delta.content,
      reasoning: delta.reasoning,
    })
  },
})

// 写入模型配置。密钥加密后存在 SQLite 里，不会出现在浏览器端。
if (config.chatEnabled) {
  try {
    await runtime.secrets.put({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
    })
  } catch (error) {
    console.warn(`[配置] 模型配置写入失败，聊天可能不可用：${error.message}`)
  }
}

// 注册待办工具。
for (const tool of createTodoTools({ todos, bus, toRawSessionId: auth.toRawSessionId })) {
  runtime.tools.register(tool)
}

// createAgentBff 只提供三个 Agent 接口，且都是 POST：
//   POST /v1/agent/sessions/:sessionId/run
//   POST /v1/agent/sessions/:sessionId/continue
//   POST /v1/agent/sessions/:sessionId/tool-results/:callId
// 待办、历史、流式都要自己补，见下面。
const agentRoutes = createAgentBff({
  harness: runtime.harness,
  authenticate: async (request) => {
    const subject = auth.resolveSubject(request.headers.get('authorization'), null)
    return subject ? { subject } : null
  },
})

/**
 * 用外层应用包住 Agent 路由。
 *
 * 不能直接往 agentRoutes 上加中间件：Hono 按注册顺序匹配，createAgentBff 内部
 * 注册的是具体路由，会先于之后添加的路径中间件响应，守卫就失效了
 * （实测会漏出 500 SECRET_NOT_CONFIGURED，而不是预期的 503）。
 * 把守卫放在外层应用上，它才能先于子应用执行。
 */
const app = new Hono()

// 聊天未启用时，明确拒绝 Agent 请求，而不是让它抛一个看不懂的错。
app.use('/v1/agent/*', async (c, next) => {
  if (!config.chatEnabled) {
    return c.json(
      {
        code: 'CHAT_DISABLED',
        message: `聊天未启用：请在 demo/.env 中设置 ${config.missingLlmKeys.join('、')}，然后重启服务。`,
      },
      503,
    )
  }
  await next()
})

app.route('/', agentRoutes)

// /api/* 统一鉴权。未设置 BFF_API_TOKEN 时不做校验，直接放行。
// EventSource 不能自定义请求头，所以额外接受 ?token=。
app.use('/api/*', async (c, next) => {
  const subject = auth.resolveSubject(
    c.req.header('authorization') ?? null,
    new URL(c.req.url).searchParams.get('token'),
  )
  if (!subject) {
    return c.json({ code: 'UNAUTHORIZED', message: '未通过鉴权' }, 401)
  }
  await next()
})

app.get('/api/config', (c) =>
  c.json({
    chatEnabled: config.chatEnabled,
    missingLlmKeys: config.missingLlmKeys,
    authRequired: Boolean(config.apiToken),
  }),
)

app.get('/api/todos', (c) => c.json({ todos: todos.list() }))

app.post('/api/todos', async (c) => {
  const body = await c.req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return c.json({ code: 'REQUEST_INVALID', message: 'title 不能为空' }, 400)

  const todo = todos.add(title)
  bus.emit({ type: 'todo_changed' })
  return c.json({ todo }, 201)
})

app.post('/api/todos/:id/complete', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ code: 'REQUEST_INVALID', message: 'id 必须是整数' }, 400)
  if (!todos.complete(id)) {
    return c.json({ code: 'NOT_FOUND', message: `没有找到 id 为 ${id} 的待办` }, 404)
  }

  bus.emit({ type: 'todo_changed' })
  return c.json({ ok: true })
})

/**
 * 会话历史。刷新页面后靠它恢复对话。
 *
 * 注意 sessionId 要加 <subject>: 前缀：bff-hono 在写会话时做了同样的改写，
 * 不加前缀会查不到任何记录。这就是 agent-kit 文档里没写、但自己查历史时最容易踩的坑。
 */
app.get('/api/sessions/:sessionId/messages', async (c) => {
  const messages = await runtime.sessions.load(auth.scopeSessionId(c.req.param('sessionId')))
  return c.json({ messages })
})

mountEventRoutes(app, { bus })

app.onError((error, c) => {
  console.error('[错误]', error)
  return c.json({ code: 'INTERNAL', message: error.message }, 500)
})

/**
 * 托管 public/ 下的静态文件。
 *
 * 放在所有路由之后。serveStatic 本身不判断请求方法（POST 也会去读文件流），
 * 所以这里只放行 GET/HEAD。找到文件就返回，找不到会调 next() 走 404。
 */
const publicDir = fileURLToPath(new URL('../public', import.meta.url))
app.use('/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next()
  return serveStatic({ root: publicDir })(c, next)
})

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.hostname }, () => {
  console.log('')
  console.log('  Agent Kit 示例 · 待办助手')
  console.log(`    地址    http://${config.hostname}:${config.port}`)
  console.log(`    数据库  ${config.databasePath}`)
  console.log(
    config.chatEnabled
      ? `    聊天    已启用（${config.model}）`
      : `    聊天    未启用，缺少 ${config.missingLlmKeys.join('、')}`,
  )
  console.log(
    config.apiToken ? '    鉴权    已启用（需要 Bearer 凭据）' : '    鉴权    未启用（任何人都能访问）',
  )
  console.log('')
})

// 收到退出信号时关掉 HTTP 服务并关闭数据库。DatabaseSync 需要显式关闭。
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[退出] 收到 ${signal}，正在关闭…`)
    server.close(() => {
      database.close()
      process.exit(0)
    })
  })
}
