import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * 配置模块。
 *
 * 这里自己解析 .env，而不是用 Node 的 --env-file，原因是主密钥需要在首次运行时
 * 生成并写回文件：--env-file 在用户代码之前就读取完毕，没法把新生成的值交给后面的代码。
 * 自己解析只有一个机制，读起来也更直白。
 */

// demo 根目录：本文件在 src/ 下，往上一级就是根目录。
export const demoRoot = fileURLToPath(new URL('..', import.meta.url))

const envPath = join(demoRoot, '.env')

/** 解析 .env 文件，返回键值对；文件不存在时返回空对象。 */
function readEnvFile() {
  if (!existsSync(envPath)) return {}

  const entries = {}
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const text = line.trim()
    // 跳过空行和注释。
    if (!text || text.startsWith('#')) continue

    const separator = text.indexOf('=')
    if (separator === -1) continue

    const key = text.slice(0, separator).trim()
    const value = text.slice(separator + 1).trim()
    // 去掉可能存在的成对引号。
    entries[key] = value.replace(/^(['"])(.*)\1$/, '$2')
  }
  return entries
}

/** 把键值写入 .env：已存在则替换该行，否则追加。 */
function writeEnvValue(key, value) {
  const line = `${key}=${value}`

  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${line}\n`)
    return
  }

  const lines = readFileSync(envPath, 'utf8').split('\n')
  const index = lines.findIndex((item) => item.trim().startsWith(`${key}=`))

  if (index === -1) lines.push(line)
  else lines[index] = line

  writeFileSync(envPath, lines.join('\n'))
}

// 先把 .env 的值填进 process.env，但不覆盖已存在的真实环境变量。
// 这样命令行传入的值优先级最高，符合常规预期。
for (const [key, value] of Object.entries(readEnvFile())) {
  process.env[key] ??= value
}

/**
 * 主密钥用于加密保存在 SQLite 中的模型配置，必须是 32 字节的 base64url。
 * 首次运行时自动生成并写回 .env —— 必须落盘，否则下次启动换了密钥，
 * 之前加密保存的模型配置就解不开了。
 */
if (!process.env.AGENT_KIT_MASTER_KEY) {
  const masterKey = randomBytes(32).toString('base64url')
  process.env.AGENT_KIT_MASTER_KEY = masterKey
  writeEnvValue('AGENT_KIT_MASTER_KEY', masterKey)
  console.log('[配置] 已生成新的 AGENT_KIT_MASTER_KEY 并写入 .env')
}

const apiKey = process.env.LLM_API_KEY
const baseUrl = process.env.LLM_BASE_URL
const model = process.env.LLM_MODEL

// 三项都齐备才认为可以聊天。缺任何一项都不报错退出，而是进入降级模式：
// 服务照常启动，待办接口可用，只有聊天被禁用。
const missingLlmKeys = [
  ['LLM_API_KEY', apiKey],
  ['LLM_BASE_URL', baseUrl],
  ['LLM_MODEL', model],
]
  .filter(([, value]) => !value)
  .map(([key]) => key)

export const config = {
  masterKey: process.env.AGENT_KIT_MASTER_KEY,
  apiKey,
  baseUrl,
  model,
  /** 是否配置齐全、可以发起对话。 */
  chatEnabled: missingLlmKeys.length === 0,
  /** 聊天不可用时，缺哪些环境变量。 */
  missingLlmKeys,
  // BFF_API_TOKEN 未设置时不鉴权，方便本地直接跑起来。
  apiToken: process.env.BFF_API_TOKEN,
  databasePath: join(demoRoot, process.env.DATABASE_PATH ?? 'demo.sqlite'),
  port: Number(process.env.PORT ?? 8790),
  hostname: process.env.HOST ?? '127.0.0.1',
}
