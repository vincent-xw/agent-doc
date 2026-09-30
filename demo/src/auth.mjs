/**
 * 鉴权与会话 id 作用域。
 *
 * 关键点：@agentkit-ai/bff-hono 在调用 harness 之前，会把 URL 里的 sessionId 改写成
 * `<subject>:<sessionId>`。所以 SQLite 里保存的会话、以及流式回调里的 sessionId，
 * 都是带前缀的。这里把前缀规则收在一个地方，避免各处手写字符串拼错。
 */

/** 演示用的固定用户标识；真实项目里应换成你自己的登录系统给出的用户 ID。 */
export const DEMO_SUBJECT = 'demo-user'

export function createAuth({ apiToken }) {
  /**
   * 校验请求身份。
   *
   * 未设置 BFF_API_TOKEN 时不做鉴权，直接用演示用户，方便 clone 后直接跑起来；
   * 一旦设置了，就要求携带 Bearer 凭据。
   *
   * @returns {string | null} 通过时返回 subject，否则返回 null
   */
  function resolveSubject(authorizationHeader, queryToken) {
    if (!apiToken) return DEMO_SUBJECT

    const token = authorizationHeader?.replace(/^Bearer\s+/i, '') ?? queryToken
    return token === apiToken ? DEMO_SUBJECT : null
  }

  /** 把浏览器传来的会话 id 变成运行时使用的带前缀 id。 */
  function scopeSessionId(rawSessionId) {
    return `${DEMO_SUBJECT}:${rawSessionId}`
  }

  /** 把带前缀的会话 id 还原成浏览器认识的形式，用于推送给前端。 */
  function toRawSessionId(scopedSessionId) {
    const prefix = `${DEMO_SUBJECT}:`
    return scopedSessionId.startsWith(prefix) ? scopedSessionId.slice(prefix.length) : scopedSessionId
  }

  return { resolveSubject, scopeSessionId, toRawSessionId }
}
