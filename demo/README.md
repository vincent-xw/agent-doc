# Agent Kit 示例 · 待办助手

一个可以跑起来的最小示例，用 [`@agentkit-ai/core`](https://www.npmjs.com/package/@agentkit-ai/core)、[`@agentkit-ai/adapter-sqlite`](https://www.npmjs.com/package/@agentkit-ai/adapter-sqlite)、[`@agentkit-ai/bff-hono`](https://www.npmjs.com/package/@agentkit-ai/bff-hono) 串成一条完整链路。

它演示的是一条真实可用的路径，而不是拼凑的片段：

- Agent 通过**服务端工具**读写 SQLite 里的**真实待办数据**（不是写死的演示数据）
- 会话和模型配置都**持久化**在 SQLite 中，重启服务后继续
- **流式输出**：模型的回复逐字出现在页面上
- 刷新页面后**恢复对话记录**
- 浏览器只和你的 BFF 通信，**模型密钥不离开服务端**

## 环境要求

**Node.js 22.13 或更高版本。**

示例直接使用内置的 `node:sqlite`，它需要较新的 Node。启动时会打印一条 `ExperimentalWarning: SQLite is an experimental feature`，这是 Node 对内置 SQLite 的常规提示，不影响使用。

## 运行

```sh
cd demo
npm install
npm start
```

然后打开 <http://127.0.0.1:8790>。

**不配模型密钥也能启动。** 这时待办功能完全可用（可以在页面上手动增删），只有聊天会被禁用并给出提示。想看完整效果，再配置模型：

```sh
cp .env.example .env
```

编辑 `.env`，填入 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`，然后重启。`AGENT_KIT_MASTER_KEY` 留空即可——首次启动会自动生成并写回 `.env`。

## 试一试

配好模型后，在聊天框里试这几句：

- `帮我加一条待办：明天上午买牛奶`
- `我现在有哪些待办？`
- `把第一条标记为完成`

你应该能看到：回复**逐字出现**，中间夹着工具调用的提示条，右侧待办面板**实时更新**。刷新页面，对话记录还在。

## 环境变量

全部在 `demo/.env` 中配置，`.env.example` 有完整注释。

| 变量 | 作用 |
| --- | --- |
| `AGENT_KIT_MASTER_KEY` | 加密保存在 SQLite 里的模型配置。**留空即自动生成**，生成后不要改动 |
| `LLM_API_KEY` | 模型服务的密钥，只放在服务端 |
| `LLM_BASE_URL` | OpenAI 兼容服务的接口地址 |
| `LLM_MODEL` | 模型名称 |
| `BFF_API_TOKEN` | **留空表示不鉴权**，方便本地直接访问；填了值则所有接口都要求 Bearer 凭据 |
| `PORT` | 服务端口，默认 `8790` |
| `DATABASE_PATH` | SQLite 文件路径，默认 `demo.sqlite` |

## 文件说明

```
demo/
├── src/
│   ├── server.mjs     装配：数据库 → 运行时 → 工具 → BFF → 静态文件
│   ├── config.mjs     读取 .env，首次启动自动生成主密钥
│   ├── auth.mjs       鉴权，以及会话 id 的 <subject>: 前缀规则
│   ├── todos.mjs      待办数据层（建表与增删查）
│   ├── tools.mjs      Agent 可调用的三个工具
│   ├── events.mjs     事件总线 + SSE 接口
│   └── prompts.mjs    系统提示词
└── public/            前端页面（原生 HTML/JS，无需构建）
```

哪个文件对应哪个包：

| 包 | 用在哪 |
| --- | --- |
| `@agentkit-ai/adapter-sqlite` | `server.mjs` 的 `createSqliteAgentRuntime`，提供 SQLite 会话存储、密钥加密存储和 Agent 运行时 |
| `@agentkit-ai/core` | 提示词注册表（`createPromptRegistry`），以及工具 schema 的生成 |
| `@agentkit-ai/bff-hono` | `server.mjs` 的 `createAgentBff`，注册三个 Agent 接口 |

## 接口一览

`createAgentBff` 只提供三个 Agent 接口，其余是本示例为演示补上的：

| 方法 | 路径 | 来源 |
| --- | --- | --- |
| POST | `/v1/agent/sessions/:sessionId/run` | bff-hono |
| POST | `/v1/agent/sessions/:sessionId/continue` | bff-hono |
| POST | `/v1/agent/sessions/:sessionId/tool-results/:callId` | bff-hono |
| GET | `/api/config` | 本示例 |
| GET | `/api/todos` · POST `/api/todos` · POST `/api/todos/:id/complete` | 本示例 |
| GET | `/api/sessions/:sessionId/messages` | 本示例 |
| GET | `/api/events` | 本示例（SSE） |

## 两处和文档示例不同的地方

这两处差异是刻意的，接入你自己的项目时按需选择：

1. **缺少模型配置时不报错退出，而是降级启动。** 文档里的示例直接 `throw`，语义简单；本示例选择让服务起得来，好让 `npm start` 之后立刻能看到东西。
2. **自己解析 `.env`，而不是用 `--env-file`。** 因为主密钥需要由应用在首次运行时生成并写回文件，而 `--env-file` 在用户代码之前就读完了，没法把新值交给后面的代码。

## 排查

**聊天没有逐字出现。** 说明你的模型服务不支持流式返回。此时聊天仍可用，只是回复会整段出现——这与所用服务有关，参见文档中关于工具调用的同类说明。

**想重置所有数据。** 停掉服务，删除 `demo/demo.sqlite` 即可。注意 `.env` 里的主密钥要一起留着，否则已保存的模型配置需要重新写入。

**端口被占用。** 8787 和 8788 已被 `agent-kit` 仓库里的示例占用，本示例默认用 8790。要改就在 `.env` 中设 `PORT`。
