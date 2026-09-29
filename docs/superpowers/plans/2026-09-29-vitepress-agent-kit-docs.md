# Agent Kit 使用文档站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一套面向首次接入者的简体中文 Agent Kit 文档站，使用 Wrangler 上传到 Cloudflare Pages。

**Architecture:** VitePress 从 `docs/` 生成静态站点；文档按快速开始、三个基础包和 Pages 发布指南排列。Wrangler 作为项目开发依赖，部署命令只上传文档构建产物。

**Tech Stack:** Node.js 22、npm、VitePress、Wrangler、Cloudflare Pages。

**Spec:** [2026-09-29-vitepress-agent-kit-docs-design.md](../specs/2026-09-29-vitepress-agent-kit-docs-design.md)

## Global Constraints

- 使用简体中文，文风简洁、面向第一次接入的开发者，不讲包的内部原理。
- 示例依据 `agent-kit/packages/{core,adapter-sqlite,bff-hono}` 的公开 API 与仓库消费方编写。
- Agent Kit 示例运行在 Node.js 服务端；Cloudflare Pages 只托管文档静态产物。
- 示例中的函数、变量和复杂处理步骤添加中文注释；密钥从环境变量读取。
- 使用 npm；Wrangler 是本地开发依赖；构建目录为 `docs/.vitepress/dist`。
- 初始化过的本地仓库不配置 GitHub remote，不登录 Cloudflare，不创建或部署 Pages 项目。
- 不运行 Agent Kit 测试套件；使用 VitePress 静态构建检查文档交付物。

---

## 文件结构

- `package.json`：Node 版本要求，以及文档开发、构建、预览和部署脚本。
- `package-lock.json`：npm 依赖锁定。
- `.gitignore`：忽略依赖目录、VitePress 输出、Wrangler 状态和本地密钥文件。
- `docs/.vitepress/config.ts`：中文站点标题、导航、侧边栏和页面元信息；排除内部设计/计划文件。
- `docs/index.md`：站点首页。
- `docs/guide/getting-started.md`：从安装到执行一次 Agent 请求的快速开始。
- `docs/packages/core.md`：注册工具和调用 core harness。
- `docs/packages/adapter-sqlite.md`：配置 SQLite runtime、模型密钥与会话存储。
- `docs/packages/bff-hono.md`：创建并挂载 Hono Agent 路由。
- `docs/deploy/cloudflare-pages.md`：构建、认证、创建 Pages 项目并上传。

## Task 1: 创建 VitePress 和 Wrangler 工程骨架

**Files:**
- Create: `package.json`
- Create: `package-lock.json`（由 npm 安装生成）
- Create: `.gitignore`
- Create: `docs/.vitepress/config.ts`
- Create: `docs/index.md`
- Create: `docs/guide/getting-started.md`
- Create: `docs/packages/core.md`
- Create: `docs/packages/adapter-sqlite.md`
- Create: `docs/packages/bff-hono.md`
- Create: `docs/deploy/cloudflare-pages.md`

- [ ] **Step 1: 创建 npm 脚本与 Node 版本约束**

在 `package.json` 声明私有文档项目、`node >=22`，并添加这些脚本：

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs",
    "deploy": "npm run docs:build && wrangler pages deploy docs/.vitepress/dist --project-name=agent-kit-docs --branch=main"
  }
}
```

- [ ] **Step 2: 安装 VitePress 与 Wrangler**

运行 `npm install --save-dev vitepress wrangler@latest`，生成 `package-lock.json` 并安装本地 CLI。

- [ ] **Step 3: 添加生成物和本地配置忽略规则**

在 `.gitignore` 忽略 `node_modules/`、`docs/.vitepress/cache/`、`docs/.vitepress/dist/`、`.wrangler/`、`.env` 和 `.env.*`，但保留 `.env.example`。

- [ ] **Step 4: 配置中文导航并隐藏内部计划文档**

在 `docs/.vitepress/config.ts` 设置中文站点标题、描述、顶栏和按“快速开始 → Core → SQLite → Hono BFF → Pages 部署”排列的侧栏。用 VitePress `srcExclude` 排除 `superpowers/**`，避免设计稿和实现计划出现在公开文档路由中。

- [ ] **Step 5: 创建六个 Markdown 页面**

创建结构中列出的首页和五个指南页面，先写上对应中文标题；下一任务填充完整内容。

## Task 2: 编写首页、快速开始和 Core 使用指南

**Files:**
- Modify: `docs/index.md`
- Modify: `docs/guide/getting-started.md`
- Modify: `docs/packages/core.md`

- [ ] **Step 1: 编写清楚的首页入口**

首页用一段话说明 Agent Kit 是项目 BFF 可接入的 Agent 运行时，并提供“开始使用”入口，指向快速开始。不描述内部架构。

- [ ] **Step 2: 编写从安装到运行的快速开始**

给出安装命令 `npm install @agentkit-ai/core @agentkit-ai/adapter-sqlite zod`。示例从 Node 环境变量读取模型配置，使用 SQLite runtime，注册一个输入为 `{ city: string }`、输出为 `{ temperature: number }` 的服务端工具，并执行一次 `harness.run`。缺失环境变量时明确报错，不添加静默默认值。

因为快速开始直接使用 `node:sqlite`，说明运行这段示例需 Node.js 22.13 或更高版本；文档站自身仍按项目配置要求 Node.js 22 或更高版本。

示例依照以下公开调用形态：

```ts
import { DatabaseSync } from 'node:sqlite'
import { createSqliteAgentRuntime } from '@agentkit-ai/adapter-sqlite'
import { z } from 'zod'

const masterKey = process.env.AGENT_KIT_MASTER_KEY
const apiKey = process.env.LLM_API_KEY
if (!masterKey || !apiKey) throw new Error('请先设置 Agent Kit 环境变量')

const runtime = createSqliteAgentRuntime({
  database: new DatabaseSync('agent.db'),
  masterKey,
})
await runtime.secrets.put({ apiKey, baseUrl: 'https://api.example.com/v1', model: 'your-model' })
runtime.tools.register({
  name: 'get_weather',
  description: '查询城市天气',
  execution: 'server',
  input: z.object({ city: z.string() }),
  output: z.object({ temperature: z.number() }),
  execute: async ({ city }) => ({ temperature: city === '杭州' ? 22 : 18 }),
})

const result = await runtime.harness.run({
  sessionId: 'first-session',
  input: '杭州现在多少度？',
  context: {},
})
console.log(result)
```

为两处环境变量读取、SQLite 文件和工具执行添加中文注释；解释把 `baseUrl` 和 `model` 换成所用服务商提供的值。

- [ ] **Step 3: 编写 Core 专页**

说明 `createToolRegistry()` 创建注册表、`register()` 注册工具、`createAgentHarness()` 接收 `llm`、`sessions`、`tools` 与 `maxSteps`，以及 `harness.run({ sessionId, input, context })` 的调用方式。展示 Zod 输入/输出 schema 和 `execution: 'server'` 示例；说明返回值包括最终回答或待远端工具执行的调用，不列出所有导出符号。

## Task 3: 编写 SQLite 适配器与 Hono BFF 指南

**Files:**
- Modify: `docs/packages/adapter-sqlite.md`
- Modify: `docs/packages/bff-hono.md`

- [ ] **Step 1: 编写 SQLite 适配器指南**

说明 `createSqliteAgentRuntime({ database, masterKey })` 会提供 `secrets`、`sessions`、`pendingCalls`、`tools` 和 `harness`；给出 `DatabaseSync`、环境变量、`runtime.secrets.put(...)` 及 `runtime.harness.run(...)` 的短例子。说明这些 SQLite 示例需 Node.js 22.13 或更高版本。清楚说明 `AGENT_KIT_MASTER_KEY` 必须是 32 字节值的 base64url 编码，并用以下 Node 命令生成；生成后稳定保存在 BFF 服务端环境中，不得放进浏览器代码或提交到仓库：

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

- [ ] **Step 2: 编写 Hono BFF 路由指南**

提供安装 `@agentkit-ai/bff-hono hono` 的命令。展示 `createAgentBff({ harness, authenticate })` 后使用 `app.route('/', agentRoutes)` 挂载。`authenticate` 验证请求凭据，失败返回 `null`，成功返回 `{ subject }`；指出示例需替换为项目自己的认证逻辑。展示 `/v1/agent/sessions/:sessionId/run` 路由及 JSON 输入 `{ input, context }`。

```ts
const agentRoutes = createAgentBff({
  harness: runtime.harness,
  authenticate: async (request) => {
    const token = request.headers.get('authorization')
    if (token !== `Bearer ${process.env.BFF_API_TOKEN}`) return null
    return { subject: 'demo-user' }
  },
})
app.route('/', agentRoutes)
```

在比较 Bearer token 前先检查 `process.env.BFF_API_TOKEN` 已设置；环境变量缺失时明确报错，不能把 `Bearer undefined` 当成有效凭据。为认证函数和用户主体绑定补充中文注释；不把模型 API Key 传给 HTTP 客户端。

## Task 4: 编写 Pages 部署说明并构建核对

**Files:**
- Modify: `docs/deploy/cloudflare-pages.md`
- Verify: `docs/.vitepress/dist/`

- [ ] **Step 1: 写出 CLI 部署步骤**

文档依次提供 `npm install`、`npm run docs:build`、`npx wrangler login`、`npx wrangler pages project create agent-kit-docs --production-branch=main` 和 `npm run deploy`。创建项目时把生产分支设为 `main`，与部署脚本相同。写清产物目录是 `docs/.vitepress/dist`、Pages 项目首次需创建；本地预览使用 `npm run docs:preview`。

- [ ] **Step 2: 构建 VitePress 站点**

运行 `npm run docs:build`。预期命令成功，并在 `docs/.vitepress/dist/` 生成首页及所有导航页面。

- [ ] **Step 3: 核对 Git 工作区**

运行 `rtk git status --short --branch`，确认 `.gitignore`、源码和文档可见，而 `node_modules/`、构建产物与本地环境文件不出现在状态中。不配置 remote、不推送。

## Self-Review

- 设计稿列出的六个页面、Node 服务端边界、Wrangler CLI、构建目录和本地 Git 均由任务覆盖。
- 没有引入运行时函数或应用业务逻辑；计划中的代码片段使用已检查的 `createSqliteAgentRuntime`、`tools.register`、`harness.run` 和 `createAgentBff` 调用签名。
- 计划排除 `docs/superpowers/**`，避免实现流程文件被作为对外文档发布。
