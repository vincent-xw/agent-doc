# 部署到 Cloudflare Pages

文档站点由 VitePress 生成静态文件。Cloudflare Pages 托管的是文档页面；Agent Kit 的示例代码仍在 Node.js 服务端运行。

## 在本地准备文档

在项目根目录安装依赖并构建文档：

```bash
npm install
npm run docs:build
```

构建结果位于 `docs/.vitepress/dist`。想先在本地查看构建后的页面，可以运行：

```bash
npm run docs:preview
```

## 首次部署

首次部署时，先登录 Cloudflare，再创建 Pages 项目：

```bash
npx wrangler login
npx wrangler pages project create agent-kit-docs --production-branch=main
```

项目名称是 `agent-kit-docs`，生产分支是 `main`，与仓库中的部署脚本一致。创建完成后运行：

```bash
npm run deploy
```

这条命令会重新构建文档，并将 `docs/.vitepress/dist` 上传到 Pages。以后更新文档时，在项目根目录再次运行 `npm run deploy` 即可。
