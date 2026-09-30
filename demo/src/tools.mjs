import { z } from 'zod'

/**
 * 待办工具。
 *
 * 三个工具都是 execution: 'server'，意味着它们在 BFF 进程内执行。
 * 这类工具由 harness 自己跑完整个调用循环，run() 最终直接返回最终回答，
 * 不会返回 pending_tool_calls —— 所以示例里不需要客户端配合执行工具。
 *
 * 注意 zod 用的是 3.x：@agentkit-ai/core 依赖 zod 3.24.4，它把 zod schema 转成
 * JSON Schema 时读的是 zod 3 的内部结构，换成 zod 4 会失效。
 */
export function createTodoTools({ todos, bus, toRawSessionId }) {
  // 事件里统一使用浏览器认识的会话 id，不带 <subject>: 前缀。
  const announce = (context, event) => {
    bus.emit({
      sessionId: context.sessionId ? toRawSessionId(context.sessionId) : undefined,
      callId: context.callId,
      ...event,
    })
  }

  /**
   * 在工具执行前后各发一个事件。
   * Agent Kit 不提供工具事件，所以这一步由工具自己完成——用 context.callId 关联同一次调用。
   */
  const withEvents = (toolName, run) => async (input, context) => {
    announce(context, { type: 'tool_start', toolName, input })
    try {
      const output = await run(input, context)
      announce(context, { type: 'tool_end', toolName, ok: true })
      return output
    } catch (error) {
      announce(context, { type: 'tool_end', toolName, ok: false, message: error.message })
      throw error
    }
  }

  return [
    {
      name: 'add_todo',
      description: '新增一条待办事项。用户说到“记一下”“加个待办”“提醒我”时使用。',
      execution: 'server',
      input: z.object({ title: z.string().describe('待办的内容') }),
      output: z.object({ id: z.number(), title: z.string(), done: z.boolean() }),
      execute: withEvents('add_todo', async ({ title }, context) => {
        const todo = todos.add(title)
        // 数据变了，通知界面刷新待办列表。
        bus.emit({ sessionId: context.sessionId ? toRawSessionId(context.sessionId) : undefined, type: 'todo_changed' })
        return todo
      }),
    },
    {
      name: 'list_todos',
      description: '列出待办事项。用户问“有哪些待办”“还剩什么没做”时使用。',
      execution: 'server',
      input: z.object({
        done: z.boolean().optional().describe('传 true 只看已完成，false 只看未完成，不传则列出全部'),
      }),
      output: z.object({
        todos: z.array(z.object({ id: z.number(), title: z.string(), done: z.boolean() })),
        total: z.number(),
      }),
      execute: withEvents('list_todos', async ({ done }) => {
        const list = todos.list(done)
        return { todos: list, total: list.length }
      }),
    },
    {
      name: 'complete_todo',
      description: '把一条待办标记为已完成。需要先用 list_todos 拿到它的 id。',
      execution: 'server',
      input: z.object({ id: z.number().describe('待办的 id，来自 list_todos 的返回结果') }),
      output: z.object({ ok: z.boolean(), id: z.number(), message: z.string().optional() }),
      execute: withEvents('complete_todo', async ({ id }, context) => {
        if (!todos.complete(id)) {
          // 不抛异常：把“没找到”作为正常结果返回，模型才能据此向用户解释。
          return { ok: false, id, message: `没有找到 id 为 ${id} 的待办` }
        }
        bus.emit({ sessionId: context.sessionId ? toRawSessionId(context.sessionId) : undefined, type: 'todo_changed' })
        return { ok: true, id }
      }),
    },
  ]
}
