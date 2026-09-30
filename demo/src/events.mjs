/**
 * 事件总线与 SSE 接口。
 *
 * Agent Kit 不提供流式传输：包只在 createSqliteAgentRuntime({ llmDelta }) 上给一个回调，
 * 怎么把 token 送到浏览器要自己决定。这里用最简单的方式——内存事件总线 + SSE。
 *
 * 鉴权统一由 server.mjs 里的 /api/* 中间件处理，这里只负责推送。
 */

/** 创建事件总线。emit 广播给所有订阅者，subscribe 返回取消订阅的函数。 */
export function createEventBus() {
  const subscribers = new Set()

  return {
    emit(event) {
      for (const subscriber of subscribers) subscriber(event)
    },

    subscribe(listener) {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
  }
}

/**
 * 挂载 GET /api/events。
 *
 * 前端用 EventSource 订阅。EventSource 不能自定义请求头，所以鉴权 token 走查询参数
 * （由 server.mjs 的中间件读取 ?token=）。
 */
export function mountEventRoutes(app, { bus }) {
  app.get('/api/events', (c) => {
    // 只推送这个会话的事件，避免多个标签页/会话之间互相串台。
    const sessionId = new URL(c.req.url).searchParams.get('sessionId')
    const encoder = new TextEncoder()

    return c.body(
      new ReadableStream({
        start(controller) {
          const send = (payload) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
            } catch {
              // 连接已断开，忽略；清理交给下面的 abort。
            }
          }

          send({ type: 'connected', sessionId })

          const unsubscribe = bus.subscribe((event) => {
            if (sessionId && event.sessionId && event.sessionId !== sessionId) return
            send(event)
          })

          // 心跳：避免连接被中间层掐断，也让前端知道连接还活着。
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': ping\n\n'))
            } catch {
              // 忽略。
            }
          }, 15000)

          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(heartbeat)
            unsubscribe()
            try {
              controller.close()
            } catch {
              // 已经关闭，忽略。
            }
          })
        },
      }),
      200,
      {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    )
  })
}
