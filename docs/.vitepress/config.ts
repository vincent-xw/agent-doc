import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Agent Kit 使用指南',
  description: '从安装到接入，快速使用 Agent Kit 的三个基础包。',
  srcExclude: ['superpowers/**'],
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/guide/getting-started' },
      { text: '示例应用', link: '/demo/' }
    ],
    sidebar: [
      { text: '快速开始', link: '/guide/getting-started' },
      { text: '示例应用', link: '/demo/' },
      { text: 'Core', link: '/packages/core' },
      { text: 'SQLite', link: '/packages/adapter-sqlite' },
      { text: 'Hono BFF', link: '/packages/bff-hono' }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/vincent-xw/agent-doc' }
    ]
  }
})
