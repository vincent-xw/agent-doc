/**
 * 待办数据层。
 *
 * 这里刻意不 import 任何 @agentkit-ai 包：待办是应用自己的业务数据，
 * Agent 的工具只是操作它的另一个入口。读这一层时不需要懂 Agent Kit。
 */

/** 建表语句。IF NOT EXISTS 让重复启动也安全。 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`

/**
 * 创建待办数据访问对象。
 * @param {import('node:sqlite').DatabaseSync} database
 */
export function createTodoStore(database) {
  database.exec(SCHEMA)

  const insert = database.prepare('INSERT INTO todos (title, done, created_at) VALUES (?, 0, ?)')
  const selectAll = database.prepare('SELECT id, title, done, created_at FROM todos ORDER BY id')
  const selectById = database.prepare('SELECT id, title, done, created_at FROM todos WHERE id = ?')
  const markDone = database.prepare('UPDATE todos SET done = 1 WHERE id = ?')

  // SQLite 没有布尔类型，用 0/1 存；这里统一转换成布尔值再交给上层。
  const toTodo = (row) =>
    row && { id: Number(row.id), title: row.title, done: row.done === 1, createdAt: row.created_at }

  return {
    /** 新增一条待办，返回新建的记录。 */
    add(title) {
      const result = insert.run(title, new Date().toISOString())
      return toTodo(selectById.get(Number(result.lastInsertRowid)))
    },

    /**
     * 列出待办。
     * @param {boolean | undefined} done 传 undefined 列出全部；传 true/false 只看已完成/未完成
     */
    list(done) {
      const rows = selectAll.all().map(toTodo)
      return done === undefined ? rows : rows.filter((todo) => todo.done === done)
    },

    /** 按 id 查单条，用于校验工具传入的 id 是否存在。 */
    get(id) {
      return toTodo(selectById.get(id))
    },

    /**
     * 标记完成。
     * @returns {boolean} 是否命中了记录；false 表示 id 不存在
     */
    complete(id) {
      return markDone.run(id).changes > 0
    },
  }
}
