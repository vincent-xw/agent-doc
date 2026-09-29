# Agent Kit 使用文档站设计

## 目标

在当前空仓库中创建一套简体中文使用文档，帮助第一次接入的开发者用好 `agent-kit/packages` 中的三个基础包：

- `@agentkit-ai/core`：创建工具并运行 Agent。
- `@agentkit-ai/adapter-sqlite`：保存会话与模型密钥，并组装运行时。
- `@agentkit-ai/bff-hono`：将运行时接入 Hono 服务并提供 HTTP 接口。

文档以操作步骤、简短说明和可复制示例为主，不展开包的内部原理。文档站使用 VitePress 生成静态页面，供 Cloudflare Pages 托管。初始化本地 Git 仓库，为之后由用户发布到 GitHub 做准备。

## 面向读者与边界

读者是想在自己的 Node.js 服务中接入 Agent Kit 的开发者。示例以现有公开导出和仓库消费方为依据，并遵守项目的最低 Node.js 版本要求。

Cloudflare Pages 只负责托管生成后的文档静态文件。Agent Kit 的 SQLite 适配器依赖 Node.js；文档不会暗示它可以作为 Pages Function 运行。

## 方案

采用“第一次接入的人能跟着做完”的指南结构：先提供快速开始，再按包分章，最后说明如何发布文档站。相比完整 API 手册，这种结构更贴合本项目的使用场景，也避免堆叠实现细节；相比三个互不关联的包说明，它能让读者看到从配置到调用的完整路径。

## 页面与主要内容

- 首页：说明 Agent Kit 能做什么，并引导读者开始接入。
- 快速开始：安装包、准备服务端配置、运行一个最小示例。
- Core：注册工具、调用运行时、读取返回结果。
- SQLite 适配器：打开 SQLite 数据库、保存模型配置、持久化会话。
- Hono BFF：创建路由、接入认证、挂载到 Hono 服务。
- Cloudflare Pages 部署：本地构建、登录 Cloudflare、创建 Pages 项目并上传静态产物。

页面侧栏按上述顺序排列。代码示例保持短小；示例中的函数、变量和不直观的处理步骤附中文注释。密钥示例使用环境变量，不写入前端代码。

## 项目结构与工具

- 在仓库根目录使用 npm 管理依赖和锁文件。
- VitePress 页面放在 `docs/`，配置放在 `docs/.vitepress/`。
- 提供开发、构建、预览和 Pages 部署脚本。
- Wrangler 安装为本项目开发依赖；构建输出为 `docs/.vitepress/dist`。
- 初始化 `.gitignore` 并执行 `git init`。暂不配置 GitHub remote、不创建远端仓库、不推送。

## 验收方式

- 三个包的安装名、导出 API 和示例参数与 `agent-kit` 当前源码、README 或消费方示例一致。
- VitePress 可以构建出供 Cloudflare Pages 使用的静态文件。
- Wrangler 可通过项目脚本上传该构建目录；本次不登录 Cloudflare、不创建远端 Pages 项目，也不部署。
- 本地 Git 仓库已初始化，生成物、依赖目录和本地环境配置在忽略列表中。
- 不运行 Agent Kit 测试套件；本次只验证文档站构建与 Git 工作区状态。
