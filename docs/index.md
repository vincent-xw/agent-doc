---
layout: home

hero:
  name: Agent Kit
  text: 给你的服务加上 Agent 能力
  tagline: 在项目 BFF 中接入 Agent 运行时，注册自己的工具，然后从服务端发起对话。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started

features:
  - title: 从一个工具开始
    details: 定义输入和输出，让 Agent 在回答问题时调用你提供的服务端功能。
  - title: 保留会话
    details: 使用 SQLite 适配器保存对话，并管理模型配置。
  - title: 接入现有服务
    details: 通过 Hono BFF 把 Agent 接到你的 HTTP 服务中。
---

Agent Kit 是项目 BFF 可接入的 Agent 运行时。这份指南会带你完成第一次调用，再按需了解 Core、SQLite 适配器和 Hono BFF 的用法。
