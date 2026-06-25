import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './assets/styles/global.css'

if (!window.api) {
  const mockDb = initMockDb()
  ;(window as any).api = createMockApi(mockDb)
}

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')

function initMockDb() {
  const notes: any[] = [
    { id: 1, title: '欢迎使用 AmNote', content: '# 欢迎使用 AmNote\n\n这是一款**AI驱动**的个人知识管理平台。\n\n## 功能特点\n\n- 笔记管理\n- Markdown编辑\n- 分类管理\n- 标签系统\n- 全文搜索\n\n> 开始你的知识管理之旅吧！', content_type: 'markdown', category_id: 1, is_favorite: 0, is_pinned: 0, is_deleted: 0, created_at: '2026-06-10 10:00:00', updated_at: '2026-06-11 09:00:00' },
    { id: 2, title: 'Vue3 学习笔记', content: '## Vue3 Composition API\n\n```js\nimport { ref, computed } from \'vue\'\n\nconst count = ref(0)\nconst doubled = computed(() => count.value * 2)\n```\n\n使用 `<script setup>` 语法糖。', content_type: 'markdown', category_id: 2, is_favorite: 1, is_pinned: 0, is_deleted: 0, created_at: '2026-06-05 14:00:00', updated_at: '2026-06-08 16:00:00' },
    { id: 3, title: 'SpringBoot 项目配置', content: '# SpringBoot 项目搭建\n\n| 配置项 | 值 |\n|--------|------|\n| Java版本 | 17 |\n| SpringBoot | 3.x |\n| 数据库 | MySQL |\n\n```yaml\nserver:\n  port: 8080\n```', content_type: 'markdown', category_id: 1, is_favorite: 0, is_pinned: 1, is_deleted: 0, created_at: '2026-06-01 08:00:00', updated_at: '2026-06-03 11:00:00' },
    { id: 4, title: '旅游计划 - 日本', content: '- 东京\n- 大阪\n- 京都\n- 北海道', content_type: 'markdown', category_id: 3, is_favorite: 0, is_pinned: 0, is_deleted: 0, created_at: '2026-05-20 20:00:00', updated_at: '2026-05-25 10:00:00' },
    { id: 5, title: 'AI 学习路线', content: '# AI 学习路线\n\n1. 数学基础\n2. Python\n3. 机器学习\n4. 深度学习\n5. NLP', content_type: 'markdown', category_id: 2, is_favorite: 1, is_pinned: 0, is_deleted: 0, created_at: '2026-04-15 12:00:00', updated_at: '2026-05-01 15:00:00' },
  ]
  const categories: any[] = [
    { id: 1, parent_id: null, name: '工作', sort_order: 1, created_at: '2026-01-01' },
    { id: 2, parent_id: null, name: '学习', sort_order: 2, created_at: '2026-01-01' },
    { id: 3, parent_id: null, name: '生活', sort_order: 3, created_at: '2026-01-01' },
  ]
  const tags: any[] = [
    { id: 1, name: 'Java', color: '#f44336' },
    { id: 2, name: 'Vue', color: '#4caf50' },
    { id: 3, name: 'AI', color: '#2196f3' },
    { id: 4, name: '工作', color: '#ff9800' },
  ]
  const noteTags: any[] = [
    { note_id: 2, tag_id: 2 },
    { note_id: 3, tag_id: 1 },
    { note_id: 5, tag_id: 3 },
  ]
  const versionCounter: Record<number, number> = {}
  const searchHistory: any[] = []
  let nextNoteId = 6, nextCatId = 4, nextTagId = 5

  return { notes, categories, tags, noteTags, versionCounter, searchHistory, nextNoteId, nextCatId, nextTagId }
}

function createMockApi(db: any) {
  return {
    getNotes: async (filters?: any) => {
      let result = db.notes.filter((n: any) => !n.is_deleted)
      if (filters) {
        if (filters.category_id !== undefined) {
          if (filters.category_id === null)
            result = result.filter((n: any) => n.category_id === null || n.category_id === undefined)
          else
            result = result.filter((n: any) => n.category_id === filters.category_id)
        }
        if (filters.is_favorite !== undefined)
          result = result.filter((n: any) => n.is_favorite === (filters.is_favorite ? 1 : 0))
        if (filters.is_pinned !== undefined)
          result = result.filter((n: any) => n.is_pinned === (filters.is_pinned ? 1 : 0))
        if (filters.tag_id)
          result = result.filter((n: any) => db.noteTags.some((nt: any) => nt.note_id === n.id && nt.tag_id === filters.tag_id))
        if (filters.year)
          result = result.filter((n: any) => n.created_at.startsWith(String(filters.year)))
        if (filters.month && filters.year)
          result = result.filter((n: any) => n.created_at.startsWith(`${filters.year}-${String(filters.month).padStart(2, '0')}`))
      }
      result.sort((a: any, b: any) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return b.updated_at.localeCompare(a.updated_at)
      })
      return result.map((n: any) => ({
        ...n, is_favorite: !!n.is_favorite, is_pinned: !!n.is_pinned, is_deleted: !!n.is_deleted,
        tags: db.tags.filter((t: any) => db.noteTags.some((nt: any) => nt.note_id === n.id && nt.tag_id === t.id)),
        category: db.categories.find((c: any) => c.id === n.category_id) || null
      }))
    },
    getNote: async (id: number) => db.notes.find((n: any) => n.id === id) || null,
    createNote: async (data: any) => {
      const id = db.nextNoteId++
      db.notes.push({ id, title: data.title || '新笔记', content: data.content || '', content_type: data.content_type || 'markdown', category_id: data.category_id || null, is_favorite: 0, is_pinned: 0, is_deleted: 0, created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      return id
    },
    updateNote: async (id: number, data: any) => {
      const note = db.notes.find((n: any) => n.id === id)
      if (!note) return
      if (data.title !== undefined) note.title = data.title
      if (data.content !== undefined) note.content = data.content
      if (data.content_type !== undefined) note.content_type = data.content_type
      if (data.category_id !== undefined) note.category_id = data.category_id
      if (data.is_favorite !== undefined) note.is_favorite = data.is_favorite ? 1 : 0
      if (data.is_pinned !== undefined) note.is_pinned = data.is_pinned ? 1 : 0
      if (data.is_deleted !== undefined) note.is_deleted = data.is_deleted ? 1 : 0
      note.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
    },
    deleteNote: async (id: number, permanent?: boolean) => {
      if (permanent) db.notes = db.notes.filter((n: any) => n.id !== id)
      else {
        const note = db.notes.find((n: any) => n.id === id)
        if (note) note.is_deleted = 1
      }
    },
    duplicateNote: async (id: number) => {
      const note = db.notes.find((n: any) => n.id === id)
      if (!note) return null
      const newId = db.nextNoteId++
      db.notes.push({ ...note, id: newId, title: note.title + ' (副本)', is_favorite: 0, is_pinned: 0, created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      return newId
    },
    getCategories: async () => {
      const map = new Map<number, any>()
      for (const c of db.categories) map.set(c.id, { ...c, children: [] })
      const roots: any[] = []
      for (const c of map.values()) {
        if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id).children.push(c)
        else roots.push(c)
      }
      return roots
    },
    createCategory: async (data: any) => { const id = db.nextCatId++; db.categories.push({ id, parent_id: data.parent_id || null, name: data.name || '', sort_order: 0, created_at: new Date().toISOString().slice(0, 10) }); return id },
    updateCategory: async (id: number, data: any) => { const cat = db.categories.find((c: any) => c.id === id); if (cat && data.name !== undefined) cat.name = data.name },
    deleteCategory: async (id: number) => { db.categories = db.categories.filter((c: any) => c.id !== id) },
    getTags: async () => db.tags,
    createTag: async (data: any) => { const id = db.nextTagId++; db.tags.push({ id, name: data.name || '', color: data.color || '#409EFF' }); return id },
    updateTag: async (id: number, data: any) => { const tag = db.tags.find((t: any) => t.id === id); if (tag) { if (data.name) tag.name = data.name; if (data.color) tag.color = data.color } },
    deleteTag: async (id: number) => { db.tags = db.tags.filter((t: any) => t.id !== id) },
    addTagToNote: async (noteId: number, tagId: number) => { if (!db.noteTags.some((nt: any) => nt.note_id === noteId && nt.tag_id === tagId)) db.noteTags.push({ note_id: noteId, tag_id: tagId }) },
    removeTagFromNote: async (noteId: number, tagId: number) => { db.noteTags = db.noteTags.filter((nt: any) => !(nt.note_id === noteId && nt.tag_id === tagId)) },
    search: async (keyword: string) => {
      db.searchHistory.push({ id: db.searchHistory.length + 1, keyword, searched_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      return db.notes.filter((n: any) => !n.is_deleted && (n.title.includes(keyword) || n.content.includes(keyword)))
        .map((n: any) => {
          let content = n.content || ''
          const idx = content.indexOf(keyword)
          let highlight = content.substring(0, 200)
          if (idx >= 0) {
            const start = Math.max(0, idx - 20)
            highlight = (start > 0 ? '...' : '') + content.substring(start, idx + keyword.length + 40) + (idx + keyword.length + 40 < content.length ? '...' : '')
            highlight = highlight.replace(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<mark>$&</mark>')
          }
          return {
            note: { ...n, is_favorite: !!n.is_favorite, is_pinned: !!n.is_pinned, is_deleted: !!n.is_deleted, tags: db.tags.filter((t: any) => db.noteTags.some((nt: any) => nt.note_id === n.id && nt.tag_id === t.id)) },
            highlight, score: 0
          }
        })
    },
    getSearchHistory: async () => [...db.searchHistory].reverse().slice(0, 20),
    getStats: async () => ({
      total_notes: db.notes.filter((n: any) => !n.is_deleted).length,
      month_new: db.notes.filter((n: any) => !n.is_deleted && n.created_at.startsWith('2026-06')).length,
      today_new: 1,
      category_count: db.categories.length,
      tag_count: db.tags.length
    }),
    getMonthlyTrend: async () => [
      { month: '2026-01', count: 0 }, { month: '2026-02', count: 0 },
      { month: '2026-03', count: 1 }, { month: '2026-04', count: 1 },
      { month: '2026-05', count: 2 }, { month: '2026-06', count: 1 }
    ],
    getCategoryDistribution: async () => {
      const result = []
      for (const cat of db.categories) {
        const count = db.notes.filter((n: any) => !n.is_deleted && n.category_id === cat.id).length
        result.push({ name: cat.name, count })
      }
      return result
    },
    getArchiveYears: async () => [2026, 2025, 2024],
    getArchiveMonths: async (year: number) => year === 2026 ? [6, 5, 4] : year === 2025 ? [12, 11] : [],
    getTrashNotes: async () => db.notes.filter((n: any) => n.is_deleted),
    restoreNote: async (id: number) => { const note = db.notes.find((n: any) => n.id === id); if (note) note.is_deleted = 0 },
    renameNote: async (id: number, newTitle: string) => { const note = db.notes.find((n: any) => n.id === id); if (note) note.title = newTitle },
    exportNoteMd: async (id: number) => {
      const note = db.notes.find((n: any) => n.id === id)
      if (!note) return null
      return { title: note.title, content: `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n---\n\n${note.content}`, type: 'markdown' }
    },
    exportNoteHtml: async (id: number) => {
      const note = db.notes.find((n: any) => n.id === id)
      if (!note) return null
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${note.title}</title></head><body><pre>${note.content}</pre></body></html>`
      return { title: note.title, content: html, type: 'html' }
    },
    moveNoteToCategory: async (noteId: number, categoryId: number) => {
      const note = db.notes.find((n: any) => n.id === noteId)
      if (note) { note.category_id = categoryId; note.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ') }
    },
    moveCategory: async (catId: number, newParentId: number | null) => {
      const cat = db.categories.find((c: any) => c.id === catId)
      if (cat && cat.id !== newParentId) cat.parent_id = newParentId
    },
    exportCategory: async (catId: number | null) => {
      const getAllDesc = (rid: number, cats: any[]): Set<number> => {
        const ids = new Set<number>([rid])
        let changed = true
        while (changed) {
          changed = false
          for (const c of cats) {
            if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
              ids.add(c.id)
              changed = true
            }
          }
        }
        return ids
      }
      let notes
      if (catId === null) {
        notes = db.notes.filter((n: any) => !n.is_deleted && !n.category_id)
      } else {
        const descIds = getAllDesc(catId, db.categories)
        notes = db.notes.filter((n: any) => !n.is_deleted && n.category_id && descIds.has(n.category_id))
      }
      let md = ''
      for (const n of notes) {
        md += `---\ntitle: "${n.title}"\ndate: ${n.updated_at}\n---\n\n${n.content}\n\n`
      }
      const catName = catId ? (db.categories.find((c: any) => c.id === catId)?.name || '分类') : '未分类'
      return { title: catName, content: md, count: notes.length }
    },
    createSubCategory: async (parentId: number, name: string) => {
      const id = db.nextCatId++
      db.categories.push({ id, parent_id: parentId, name, sort_order: db.categories.length + 1, created_at: new Date().toISOString().slice(0, 10), is_favorite: 0 })
      return id
    },
    renameCategory: async (id: number, newName: string) => {
      const cat = db.categories.find((c: any) => c.id === id)
      if (cat) cat.name = newName
    },
    toggleCategoryFavorite: async (id: number) => {
      const cat = db.categories.find((c: any) => c.id === id)
      if (cat) { cat.is_favorite = cat.is_favorite ? 0 : 1; return cat.is_favorite === 1 }
      return false
    },
    getFavoriteCategories: async () => {
      const favs = db.categories.filter((c: any) => c.is_favorite)
      const map = new Map<number, any>()
      for (const c of favs) map.set(c.id, { ...c, children: [] })
      const roots: any[] = []
      for (const c of map.values()) {
        if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id).children.push(c)
        else roots.push(c)
      }
      return roots
    },
    getNoteVersions: async () => [],
    restoreVersion: async () => {},
    exportAllData: async () => {
      return {
        version: '1.0',
        exported_at: new Date().toISOString(),
        notes: db.notes.map((n: any) => ({ ...n, is_favorite: !!n.is_favorite, is_pinned: !!n.is_pinned, is_deleted: !!n.is_deleted })),
        categories: db.categories,
        tags: db.tags,
        note_tags: db.noteTags,
        note_versions: []
      }
    },
    importAllData: async (data: any) => {
      let importedNotes = 0, importedCategories = 0, importedTags = 0, importedNoteTags = 0, skippedNotes = 0
      if (data.categories) {
        for (const cat of data.categories) {
          if (!db.categories.find((c: any) => c.name === cat.name && c.parent_id === (cat.parent_id || null))) {
            db.categories.push({ id: cat.id || db.nextCatId++, parent_id: cat.parent_id || null, name: cat.name, sort_order: cat.sort_order || 0, created_at: cat.created_at || new Date().toISOString().slice(0, 10) })
            importedCategories++
          }
        }
      }
      if (data.tags) {
        for (const tag of data.tags) {
          if (!db.tags.find((t: any) => t.name === tag.name)) {
            db.tags.push({ id: tag.id || db.nextTagId++, name: tag.name, color: tag.color || '#409EFF' })
            importedTags++
          }
        }
      }
      if (data.notes) {
        for (const note of data.notes) {
          if (!db.notes.find((n: any) => n.id === note.id)) {
            db.notes.push({ ...note, is_favorite: note.is_favorite ? 1 : 0, is_pinned: note.is_pinned ? 1 : 0, is_deleted: note.is_deleted ? 1 : 0 })
            importedNotes++
          } else { skippedNotes++ }
        }
      }
      if (data.note_tags) {
        for (const nt of data.note_tags) {
          if (!db.noteTags.find((n: any) => n.note_id === nt.note_id && n.tag_id === nt.tag_id)) {
            db.noteTags.push(nt)
            importedNoteTags++
          }
        }
      }
      return { success: true, message: `导入完成：${importedNotes} 篇笔记, ${importedCategories} 个分类, ${importedTags} 个标签, ${importedNoteTags} 个关联`, imported_notes: importedNotes, imported_categories: importedCategories, imported_tags: importedTags, imported_note_tags: importedNoteTags, skipped_notes: skippedNotes }
    },
    importMarkdownFiles: async (files: { name: string; content: string }[]) => {
      let count = 0
      for (const f of files) {
        const id = db.nextNoteId++
        const title = f.name.replace(/\.md$/i, '').replace(/[-_]/g, ' ')
        db.notes.push({ id, title, content: f.content, content_type: 'markdown', category_id: null, is_favorite: 0, is_pinned: 0, is_deleted: 0, created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
        count++
      }
      return { success: true, message: `成功导入 ${count} 个 Markdown 文件`, count }
    },
    clearAllData: async () => {
      db.notes.length = 0; db.categories.length = 0; db.tags.length = 0
      db.noteTags.length = 0; db.searchHistory.length = 0; db.nextNoteId = 1; db.nextCatId = 1; db.nextTagId = 1
      return { success: true, message: '所有数据已清除' }
    },
    testSyncConnection: async () => {
      return { ok: false, message: '浏览器演示模式 — 请打包为 .exe 后使用云同步功能' }
    },
    uploadToCloud: async () => {
      return { ok: false, message: '浏览器演示模式 — 请打包为 .exe 后使用云同步功能' }
    },
    downloadFromCloud: async () => {
      return { ok: false, message: '浏览器演示模式 — 请打包为 .exe 后使用云同步功能' }
    },
    onGlobalSearch: (cb: () => void) => { document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); cb() } }); return () => {} }
  }
}
