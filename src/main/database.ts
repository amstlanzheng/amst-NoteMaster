import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { join, dirname } from 'path'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { app } from 'electron'

let db: Database | null = null
let SQL: SqlJsStatic | null = null

function resolveDbPath(): string {
  const candidates = [
    join(app.getPath('userData'), 'amnote.db'),
    join(dirname(process.execPath), 'amnote-data', 'amnote.db')
  ]
  for (const p of candidates) {
    try {
      const d = dirname(p)
      if (!existsSync(d)) mkdirSync(d, { recursive: true })
      return p
    } catch { continue }
  }
  return join(app.getPath('userData'), 'amnote.db')
}

const DB_PATH = resolveDbPath()

export function getDbPath(): string { 
  console.log('[Database] Database path:', DB_PATH)
  return DB_PATH 
}

function saveDb() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(DB_PATH, buffer)
}

function locateWasm(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return join(dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
  }
  const appDir = dirname(app.getPath('exe'))
  const unpackedPath = join(appDir, 'resources', 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  if (existsSync(unpackedPath)) return unpackedPath
  return join(appDir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

export async function initDatabase(): Promise<Database> {
  SQL = await (initSqlJs as any)({ locateFile: () => locateWasm() })

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')
  initTables()
  saveDb()
  return db
}

function initTables() {
  if (!db) return

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      name VARCHAR(100) NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(50) NOT NULL UNIQUE,
      color VARCHAR(20) DEFAULT '#409EFF'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) NOT NULL DEFAULT '',
      content TEXT DEFAULT '',
      content_type VARCHAR(20) DEFAULT 'markdown',
      category_id INTEGER,
      is_favorite INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (note_id, tag_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS note_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      title VARCHAR(255),
      content TEXT,
      content_type VARCHAR(20),
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword VARCHAR(255) NOT NULL,
      searched_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS external_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER,
      imported_at TEXT DEFAULT (datetime('now','localtime')),
      category_id INTEGER,
      note_id INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (note_id) REFERENCES notes(id)
    )
  `)

  const catResult = db.exec('SELECT COUNT(*) as cnt FROM categories')
  if (catResult.length > 0) {
    const cnt = catResult[0].values[0][0] as number
    if (cnt === 0) {
      db.run('INSERT INTO categories (name, sort_order) VALUES (?, ?)', ['工作', 1])
      db.run('INSERT INTO categories (name, sort_order) VALUES (?, ?)', ['学习', 2])
      db.run('INSERT INTO categories (name, sort_order) VALUES (?, ?)', ['生活', 3])
    }
  }

  const tagResult = db.exec('SELECT COUNT(*) as cnt FROM tags')
  if (tagResult.length > 0) {
    const cnt = tagResult[0].values[0][0] as number
    if (cnt === 0) {
      db.run('INSERT INTO tags (name, color) VALUES (?, ?)', ['Java', '#f44336'])
      db.run('INSERT INTO tags (name, color) VALUES (?, ?)', ['Vue', '#4caf50'])
      db.run('INSERT INTO tags (name, color) VALUES (?, ?)', ['AI', '#2196f3'])
      db.run('INSERT INTO tags (name, color) VALUES (?, ?)', ['工作', '#ff9800'])
    }
  }

  const noteResult = db.exec('SELECT COUNT(*) as cnt FROM notes')
  if (noteResult.length > 0) {
    const cnt = noteResult[0].values[0][0] as number
    if (cnt === 0) {
      db.run(`INSERT INTO notes (title, content, category_id, is_pinned) VALUES (?, ?, ?, ?)`,
        ['欢迎使用 AmNote', '# 欢迎使用 AmNote\n\n这是一款**AI驱动**的个人知识管理平台。\n\n## 功能特点\n\n- 笔记管理\n- Markdown编辑\n- 分类管理\n- 标签系统\n- 全文搜索\n\n> 开始你的知识管理之旅吧！', 1, 1])
      db.run(`INSERT INTO notes (title, content, category_id, is_favorite) VALUES (?, ?, ?, ?)`,
        ['Vue3 学习笔记', '## Vue3 Composition API\n\n```js\nimport { ref, computed } from \'vue\'\n\nconst count = ref(0)\nconst doubled = computed(() => count.value * 2)\n```\n\n使用 `<script setup>` 语法糖。', 2, 1])
      db.run(`INSERT INTO notes (title, content, category_id) VALUES (?, ?, ?)`,
        ['SpringBoot 项目配置', '# SpringBoot 项目搭建\n\n| 配置项 | 值 |\n|--------|------|\n| Java版本 | 17 |\n| SpringBoot | 3.x |\n| 数据库 | MySQL |\n\n```yaml\nserver:\n  port: 8080\n```', 1])
      db.run(`INSERT INTO notes (title, content, category_id) VALUES (?, ?, ?)`,
        ['旅游计划 - 日本', '- 东京\n- 大阪\n- 京都\n- 北海道', 3])
      db.run(`INSERT INTO notes (title, content, category_id, is_favorite) VALUES (?, ?, ?, ?)`,
        ['AI 学习路线', '# AI 学习路线\n\n1. 数学基础\n2. Python\n3. 机器学习\n4. 深度学习\n5. NLP', 2, 1])
    }
  }
}

function getAll(sql: string, params: any[] = []): any[] {
  if (!db) return []
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const results: any[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

function getOne(sql: string, params: any[] = []): any | null {
  if (!db) return null
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  let result: any = null
  if (stmt.step()) {
    result = stmt.getAsObject()
  }
  stmt.free()
  return result
}

function run(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  if (!db) return { lastInsertRowid: 0, changes: 0 }
  db.run(sql, params)
  const lastId = (db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0] as number) || 0
  const changes = db.getRowsModified()
  saveDb()
  return { lastInsertRowid: lastId, changes }
}

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return {
    getAll, getOne, run,
    prepare: (sql: string) => db!.prepare(sql),
    exec: (sql: string) => db!.exec(sql)
  }
}

export { getAll, getOne, run, saveDb }
