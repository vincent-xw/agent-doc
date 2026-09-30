/**
 * 前端逻辑。
 *
 * 只有两条数据通路：
 *   1. fetch  —— 调用 BFF 的 Agent 接口和待办接口
 *   2. EventSource —— 接收流式 token、工具调用和待办变更
 *
 * 流式期间用 delta 实时显示，收到最终结果后重新从历史接口拉一次，
 * 用服务端的权威数据覆盖——省去在前端做 delta 与最终答案的对账。
 */

const el = {
  authBar: document.querySelector('#auth-bar'),
  token: document.querySelector('#token'),
  todos: document.querySelector('#todos'),
  todosEmpty: document.querySelector('#todos-empty'),
  todosCount: document.querySelector('#todos-count'),
  todoForm: document.querySelector('#todo-form'),
  todoTitle: document.querySelector('#todo-title'),
  messages: document.querySelector('#messages'),
  chatForm: document.querySelector('#chat-form'),
  chatInput: document.querySelector('#chat-input'),
  chatHint: document.querySelector('#chat-hint'),
  newSession: document.querySelector('#new-session'),
}

// 凭据和会话 id 存在本地，刷新页面后还能接上同一段对话。
let token = localStorage.getItem('demo_token') ?? ''
let sessionId = localStorage.getItem('demo_session') ?? newSessionId()

// 当前正在流式输出的助手气泡，由 llm_delta 事件填充。
let live = { turnId: null, element: null }

function newSessionId() {
  const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  localStorage.setItem('demo_session', id)
  return id
}

function escapeText(value) {
  if (value === null || value === undefined) return ''
  // 模型的最终输出通常是字符串，但类型上是 unknown，其他情况直接序列化。
  return typeof value === 'string' ? value : JSON.stringify(value)
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) }
  if (options.body) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`

  const response = await fetch(path, { ...options, headers })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return payload
}

/* ---------- 待办 ---------- */

async function loadTodos() {
  const { todos } = await api('/api/todos')
  renderTodos(todos)
}

function renderTodos(todos) {
  el.todos.replaceChildren()
  el.todosEmpty.hidden = todos.length > 0

  const done = todos.filter((todo) => todo.done).length
  el.todosCount.textContent = todos.length ? `已完成 ${done} / ${todos.length}` : ''

  for (const todo of todos) {
    const item = document.createElement('li')
    item.className = todo.done ? 'todo-item done' : 'todo-item'

    const id = document.createElement('span')
    id.className = 'todo-id'
    id.textContent = `#${todo.id}`

    const title = document.createElement('span')
    title.className = 'todo-title'
    title.textContent = todo.title

    item.append(id, title)

    if (!todo.done) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'link'
      button.textContent = '完成'
      button.addEventListener('click', () => completeTodo(todo.id))
      item.append(button)
    }

    el.todos.append(item)
  }
}

async function addTodo(title) {
  await api('/api/todos', { method: 'POST', body: JSON.stringify({ title }) })
  await loadTodos()
}

async function completeTodo(id) {
  await api(`/api/todos/${id}/complete`, { method: 'POST' })
  await loadTodos()
}

/* ---------- 对话 ---------- */

/**
 * 渲染历史消息。
 *
 * 注意两种“空”消息：
 *   - 模型决定调用工具的那一轮，assistant 消息的 content 是 null，跳过不渲染；
 *   - role 为 tool 的消息是工具执行记录，渲染成一条小提示。
 */
function renderMessages(messages) {
  el.messages.replaceChildren()
  live = { turnId: null, element: null }

  for (const message of messages) {
    if (message.role === 'user') {
      appendBubble('user', escapeText(message.content))
    } else if (message.role === 'assistant') {
      const text = escapeText(message.content)
      if (text) appendBubble('assistant', text)
    } else if (message.role === 'tool') {
      appendBubble('tool', `调用工具 ${message.toolName ?? ''}`)
    }
    // role 为 system 的消息不会落盘，这里也不用处理。
  }
  scrollToBottom()
}

function appendBubble(kind, text) {
  const node = document.createElement('div')
  node.className = `msg ${kind}`
  node.textContent = text
  el.messages.append(node)
  scrollToBottom()
  return node
}

function scrollToBottom() {
  el.messages.scrollTop = el.messages.scrollHeight
}

async function loadMessages() {
  const { messages } = await api(`/api/sessions/${sessionId}/messages`)
  renderMessages(messages)
}

async function sendMessage(text) {
  appendBubble('user', text)
  // 先放一个占位气泡；如果模型支持流式，第一个 delta 到达时会替换掉它。
  const pending = appendBubble('assistant pending', '思考中…')

  try {
    const result = await api(`/v1/agent/sessions/${sessionId}/run`, {
      method: 'POST',
      body: JSON.stringify({ input: text, context: {} }),
    })

    // 服务端工具由 harness 执行完，所以正常情况下直接拿到 final。
    // 这里仍然处理其他两种情况，便于对照 Core 文档里的返回类型。
    if (result.type === 'pending_tool_calls') {
      throw new Error('收到待执行的远端工具调用；本示例只注册了服务端工具。')
    }

    // 用服务端的权威记录重画一次，同时刷新待办（Agent 可能刚改过数据）。
    await Promise.all([loadMessages(), loadTodos()])
  } catch (error) {
    pending.remove()
    appendBubble('assistant error', error.message)
  }
}

/* ---------- 流式与实时事件 ---------- */

function handleDelta(delta) {
  // 第一个 delta 到达时，去掉“思考中…”占位气泡。
  if (el.messages.querySelector('.pending')) el.messages.querySelector('.pending').remove()

  // 按 turnId 区分不同的输出轮次，新的一轮就新建气泡。
  if (live.turnId !== delta.turnId || !live.element) {
    live.turnId = delta.turnId
    live.element = appendBubble('assistant', '')
  }

  live.element.textContent += delta.content ?? ''
  scrollToBottom()
}

function connectEvents() {
  const source = new EventSource(
    `/api/events?sessionId=${encodeURIComponent(sessionId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`,
  )

  source.onmessage = (event) => {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      return
    }

    if (payload.type === 'llm_delta') handleDelta(payload)
    else if (payload.type === 'tool_start') appendBubble('tool', `正在调用 ${payload.toolName}…`)
    else if (payload.type === 'todo_changed') loadTodos()
  }

  // 连接断开时浏览器会自动重连，这里只提示一次状态。
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      appendBubble('tool', '实时连接已断开')
    }
  }
}

/* ---------- 启动 ---------- */

async function loadConfig() {
  const config = await api('/api/config')

  if (config.authRequired) {
    el.authBar.hidden = false
    el.token.value = token
  }

  if (!config.chatEnabled) {
    const missing = config.missingLlmKeys.join('、')
    el.chatHint.hidden = false
    el.chatHint.textContent = `聊天未启用：请在 demo/.env 中设置 ${missing}，然后重启服务。待办功能不受影响，可以直接使用。`
    el.chatInput.disabled = true
    el.chatInput.placeholder = '聊天未启用'
    el.chatForm.querySelector('button').disabled = true
  }
}

el.todoForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const title = el.todoTitle.value.trim()
  if (!title) return
  el.todoTitle.value = ''
  await addTodo(title)
})

el.chatForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const text = el.chatInput.value.trim()
  if (!text) return

  el.chatInput.value = ''
  el.chatForm.querySelector('button').disabled = true
  try {
    await sendMessage(text)
  } finally {
    el.chatForm.querySelector('button').disabled = false
  }
})

el.newSession.addEventListener('click', async () => {
  sessionId = newSessionId()
  renderMessages([])
  // 会话换了，事件订阅也要指向新会话。
  connectEvents()
})

el.token.addEventListener('change', () => {
  token = el.token.value.trim()
  localStorage.setItem('demo_token', token)
  // 凭据变了，重新建连接和拉数据。
  connectEvents()
  loadTodos().catch(() => {})
})

await loadConfig()
connectEvents()
await Promise.all([loadTodos(), loadMessages()])
