/**
 * AmNote Tauri API Adapter
 * 重新实现原 Electron 的 window.api，映射到 Tauri plugin-sql + invoke
 * 所有 Vue 组件无需改动，仍调用 window.api.xxx
 */
import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { exit } from '@tauri-apps/plugin-process'
import type { Note, Category, Tag, FilterOptions, SftpConfig, MinioConfig } from './shared/types'

let db: Database | null = null
let dbReady = false
const dbReadyCallbacks: (() => void)[] = []

/** 将 SQL 的 ? 占位符转换为 tauri-plugin-sql 的 $1, $2 格式 */
function conv(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

/** 查询多行 */
async function getAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (!db) throw new Error('数据库未初始化')
  return db.select<T[]>(conv(sql), params)
}

/** 查询单行 */
async function getOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  if (!db) throw new Error('数据库未初始化')
  const rows = await db.select<T[]>(conv(sql), params)
  return rows.length > 0 ? rows[0] : null
}

/** 执行写操作，返回 { lastInsertRowid, changes } */
async function run(sql: string, params: any[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
  if (!db) throw new Error('数据库未初始化')
  const result = await db.execute(conv(sql), params) as any
  return {
    lastInsertRowid: result.lastInsertId || 0,
    changes: result.rowsAffected || 0
  }
}

// ============================================================
// 辅助函数
// ============================================================

/** 递归收集分类及其所有子分类的 ID */
async function collectSubCategoryIds(parentId: number): Promise<number[]> {
  const ids = [parentId]
  const rows = await getAll<{ id: number }>('SELECT id FROM categories WHERE parent_id = ?', [parentId])
  for (const row of rows) {
    ids.push(...await collectSubCategoryIds(row.id))
  }
  return ids
}

/** 构建分类树 */
function buildCategoryTree(categories: any[]): any[] {
  const map = new Map<number, any>()
  for (const c of categories) map.set(c.id, { ...c, children: [] })
  const roots: any[] = []
  for (const c of map.values()) {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id).children.push(c)
    } else {
      roots.push(c)
    }
  }
  return roots
}

/** 为分类树添加笔记数量 */
async function addNoteCount(cats: any[]) {
  for (const cat of cats) {
    const row = await getOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notes WHERE category_id = ? AND is_deleted = 0', [cat.id])
    cat.note_count = row?.cnt || 0
    if (cat.children && cat.children.length > 0) {
      await addNoteCount(cat.children)
    }
  }
}

// ============================================================
// 笔记操作
// ============================================================

async function getNotes(filters?: FilterOptions): Promise<Note[]> {
  let sql = 'SELECT n.* FROM notes n WHERE n.is_deleted = 0'
  const params: any[] = []

  if (filters) {
    if (filters.category_id !== undefined) {
      if (filters.category_id === null) {
        sql += ' AND n.category_id IS NULL'
      } else if (filters.include_subcategories) {
        const allIds = await collectSubCategoryIds(filters.category_id)
        const placeholders = allIds.map((_, i) => `$${i + 1}`).join(',')
        sql += ` AND n.category_id IN (${placeholders})`
        params.push(...allIds)
      } else {
        sql += ' AND n.category_id = ?'
        params.push(filters.category_id)
      }
    }
    if (filters.is_favorite !== undefined) {
      sql += ' AND n.is_favorite = ?'
      params.push(filters.is_favorite ? 1 : 0)
    }
    if (filters.is_pinned !== undefined) {
      sql += ' AND n.is_pinned = ?'
      params.push(filters.is_pinned ? 1 : 0)
    }
    if (filters.tag_id !== undefined) {
      if (filters.tag_id === 0) {
        sql += ' AND n.id NOT IN (SELECT DISTINCT note_id FROM note_tags)'
      } else {
        sql += ' AND n.id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)'
        params.push(filters.tag_id)
      }
    }
    if (filters.year) {
      sql += ` AND strftime('%Y', n.created_at) = ?`
      params.push(String(filters.year))
    }
    if (filters.month && filters.year) {
      sql += ` AND strftime('%m', n.created_at) = ?`
      params.push(String(filters.month).padStart(2, '0'))
    }
    if (filters.keyword) {
      sql += ` AND (n.title LIKE ? OR n.content LIKE ?)`
      const kw = `%${filters.keyword}%`
      params.push(kw, kw)
    }
  }

  const sortBy = filters?.sort_by || 'updated_at'
  const sortOrder = filters?.sort_order || 'desc'
  if (sortBy === 'sort_weight') {
    sql += ' ORDER BY n.is_pinned DESC, n.sort_weight ASC, n.updated_at DESC'
  } else if (sortBy === 'created_at') {
    sql += sortOrder === 'asc'
      ? ' ORDER BY n.is_pinned DESC, n.created_at ASC'
      : ' ORDER BY n.is_pinned DESC, n.created_at DESC'
  } else {
    sql += sortOrder === 'asc'
      ? ' ORDER BY n.is_pinned DESC, n.updated_at ASC'
      : ' ORDER BY n.is_pinned DESC, n.updated_at DESC'
  }

  const notes = await getAll<any>(sql, params)
  const result: Note[] = []
  for (const note of notes) {
    const tags = await getAll<Tag>('SELECT t.* FROM tags t INNER JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?', [note.id])
    const category = note.category_id ? await getOne('SELECT * FROM categories WHERE id = ?', [note.category_id]) : null
    result.push({
      ...note,
      is_favorite: !!note.is_favorite,
      is_pinned: !!note.is_pinned,
      is_deleted: !!note.is_deleted,
      tags,
      category: category || null
    })
  }
  return result
}

async function getNote(id: number): Promise<Note | null> {
  const note = await getOne<any>('SELECT * FROM notes WHERE id = ?', [id])
  if (!note) return null
  return {
    ...note,
    is_favorite: !!note.is_favorite,
    is_pinned: !!note.is_pinned,
    is_deleted: !!note.is_deleted
  }
}

async function createNote(data: Partial<Note>): Promise<number> {
  const result = await run(
    'INSERT INTO notes (title, content, content_type, category_id) VALUES (?, ?, ?, ?)',
    [data.title || '', data.content || '', data.content_type || 'markdown', data.category_id || null]
  )
  return result.lastInsertRowid
}

async function updateNote(id: number, data: Partial<Note>): Promise<void> {
  const fields: string[] = []
  const params: any[] = []
  if (data.title !== undefined || data.content !== undefined) {
    fields.push("updated_at = datetime('now','localtime')")
  }
  if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title) }
  if (data.content !== undefined) { fields.push('content = ?'); params.push(data.content) }
  if (data.content_type !== undefined) { fields.push('content_type = ?'); params.push(data.content_type) }
  if (data.category_id !== undefined) { fields.push('category_id = ?'); params.push(data.category_id) }
  if (data.is_favorite !== undefined) { fields.push('is_favorite = ?'); params.push(data.is_favorite ? 1 : 0) }
  if (data.is_pinned !== undefined) { fields.push('is_pinned = ?'); params.push(data.is_pinned ? 1 : 0) }
  if (data.is_deleted !== undefined) { fields.push('is_deleted = ?'); params.push(data.is_deleted ? 1 : 0) }
  params.push(id)
  await run(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, params)

  if (data.content !== undefined || data.title !== undefined) {
    const current = await getOne('SELECT title, content, content_type FROM notes WHERE id = ?', [id])
    if (current) {
      const maxVer = await getOne<{ mv: number }>('SELECT COALESCE(MAX(version), 0) as mv FROM note_versions WHERE note_id = ?', [id])
      await run('INSERT INTO note_versions (note_id, title, content, content_type, version) VALUES (?, ?, ?, ?, ?)',
        [id, current.title, current.content, current.content_type, (maxVer?.mv || 0) + 1])
    }
  }
}

async function deleteNote(id: number, permanent?: boolean): Promise<void> {
  if (permanent) {
    await run('DELETE FROM notes WHERE id = ?', [id])
  } else {
    await run("UPDATE notes SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?", [id])
  }
}

async function batchDeleteNotes(ids: number[], permanent?: boolean): Promise<{ deleted: number }> {
  if (!ids || ids.length === 0) return { deleted: 0 }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
  if (permanent) {
    await run(`DELETE FROM notes WHERE id IN (${placeholders})`, ids)
  } else {
    await run(`UPDATE notes SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id IN (${placeholders})`, ids)
  }
  return { deleted: ids.length }
}

async function duplicateNote(id: number): Promise<number | null> {
  const note = await getOne<any>('SELECT * FROM notes WHERE id = ?', [id])
  if (!note) return null
  const result = await run(
    'INSERT INTO notes (title, content, content_type, category_id, is_favorite, is_pinned) VALUES (?, ?, ?, ?, ?, ?)',
    [note.title + ' (副本)', note.content, note.content_type, note.category_id, 0, 0]
  )
  return result.lastInsertRowid
}

async function renameNote(id: number, newTitle: string): Promise<void> {
  await run("UPDATE notes SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?", [newTitle, id])
}

async function updateNoteWeight(id: number, weight: number): Promise<void> {
  await run('UPDATE notes SET sort_weight = ? WHERE id = ?', [weight, id])
}

// ============================================================
// 分类操作
// ============================================================

async function getCategories(): Promise<any[]> {
  const categories = await getAll('SELECT * FROM categories ORDER BY sort_order')
  const tree = buildCategoryTree(categories)
  await addNoteCount(tree)
  return tree
}

async function createCategory(data: Partial<Category>): Promise<number> {
  const result = await run('INSERT INTO categories (parent_id, name, sort_order) VALUES (?, ?, ?)',
    [data.parent_id || null, data.name || '', data.sort_order || 0])
  return result.lastInsertRowid
}

async function updateCategory(id: number, data: Partial<Category>): Promise<void> {
  if (data.sort_order !== undefined) await run('UPDATE categories SET sort_order = ? WHERE id = ?', [data.sort_order, id])
  if (data.name !== undefined) await run('UPDATE categories SET name = ? WHERE id = ?', [data.name, id])
  if (data.parent_id !== undefined) await run('UPDATE categories SET parent_id = ? WHERE id = ?', [data.parent_id, id])
}

async function deleteCategory(id: number): Promise<void> {
  await run('UPDATE notes SET category_id = NULL WHERE category_id = ?', [id])
  await run('DELETE FROM categories WHERE id = ?', [id])
}

async function createSubCategory(parentId: number, name: string): Promise<number> {
  const maxSort = await getOne<{ ms: number }>('SELECT COALESCE(MAX(sort_order), 0) as ms FROM categories WHERE parent_id = ?', [parentId])
  const result = await run('INSERT INTO categories (parent_id, name, sort_order) VALUES (?, ?, ?)',
    [parentId, name, (maxSort?.ms || 0) + 1])
  return result.lastInsertRowid
}

async function renameCategory(id: number, newName: string): Promise<void> {
  await run('UPDATE categories SET name = ? WHERE id = ?', [newName, id])
}

async function toggleCategoryFavorite(id: number): Promise<boolean> {
  const cat = await getOne<{ is_favorite: number }>('SELECT is_favorite FROM categories WHERE id = ?', [id])
  const newVal = cat && cat.is_favorite ? 0 : 1
  await run('UPDATE categories SET is_favorite = ? WHERE id = ?', [newVal, id])
  return newVal === 1
}

async function getFavoriteCategories(): Promise<any[]> {
  const cats = await getAll('SELECT * FROM categories WHERE is_favorite = 1 ORDER BY sort_order')
  return buildCategoryTree(cats)
}

async function moveNoteToCategory(noteId: number, categoryId: number): Promise<void> {
  await run("UPDATE notes SET category_id = ?, updated_at = datetime('now','localtime') WHERE id = ?", [categoryId, noteId])
}

async function moveCategory(catId: number, newParentId: number | null): Promise<void> {
  if (newParentId === catId) return
  await run('UPDATE categories SET parent_id = ? WHERE id = ?', [newParentId, catId])
}

// ============================================================
// 标签操作
// ============================================================

async function getTags(): Promise<Tag[]> {
  return getAll<Tag>('SELECT * FROM tags ORDER BY name')
}

async function createTag(data: Partial<Tag>): Promise<number> {
  const result = await run('INSERT INTO tags (name, color) VALUES (?, ?)', [data.name || '', data.color || '#409EFF'])
  return result.lastInsertRowid
}

async function updateTag(id: number, data: Partial<Tag>): Promise<void> {
  const fields: string[] = []
  const params: any[] = []
  if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name) }
  if (data.color !== undefined) { fields.push('color = ?'); params.push(data.color) }
  if (fields.length > 0) { params.push(id); await run(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`, params) }
}

async function deleteTag(id: number): Promise<void> {
  await run('DELETE FROM tags WHERE id = ?', [id])
}

async function addTagToNote(noteId: number, tagId: number): Promise<void> {
  const exist = await getOne('SELECT 1 as e FROM note_tags WHERE note_id = ? AND tag_id = ?', [noteId, tagId])
  if (!exist) await run('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tagId])
}

async function removeTagFromNote(noteId: number, tagId: number): Promise<void> {
  await run('DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?', [noteId, tagId])
}

// ============================================================
// 搜索
// ============================================================

async function search(keyword: string): Promise<any[]> {
  if (!keyword.trim()) return []
  const escaped = `%${keyword}%`
  await run('INSERT INTO search_history (keyword) VALUES (?)', [keyword])
  const results = await getAll<any>(
    `SELECT n.* FROM notes n WHERE n.is_deleted = 0 AND (n.title LIKE ? OR n.content LIKE ?) ORDER BY n.updated_at DESC LIMIT 100`,
    [escaped, escaped]
  )
  return results.map((r: any) => {
    let highlight = (r.content || '').substring(0, 200)
    const idx = highlight.toLowerCase().indexOf(keyword.toLowerCase())
    if (idx >= 0) {
      const start = Math.max(0, idx - 40)
      const end = Math.min(highlight.length, idx + keyword.length + 40)
      let snippet = highlight.substring(start, end)
      if (start > 0) snippet = '...' + snippet
      if (end < highlight.length) snippet += '...'
      const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      highlight = snippet.replace(re, '<mark>$&</mark>')
    }
    return { note: { ...r, is_favorite: !!r.is_favorite, is_pinned: !!r.is_pinned, is_deleted: !!r.is_deleted }, highlight, score: 0 }
  })
}

async function getSearchHistory(): Promise<any[]> {
  return getAll('SELECT * FROM search_history ORDER BY searched_at DESC LIMIT 20')
}

// ============================================================
// 统计
// ============================================================

async function getStats(): Promise<any> {
  const total = (await getOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 0"))?.cnt || 0
  const monthNew = (await getOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 0 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now','localtime')"))?.cnt || 0
  const todayNew = (await getOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 0 AND date(created_at) = date('now','localtime')"))?.cnt || 0
  const catCount = (await getOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM categories'))?.cnt || 0
  const tagCount = (await getOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM tags'))?.cnt || 0
  return { total_notes: total, month_new: monthNew, today_new: todayNew, category_count: catCount, tag_count: tagCount }
}

async function getMonthlyTrend(): Promise<any[]> {
  return getAll(`SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM notes WHERE is_deleted = 0 GROUP BY month ORDER BY month DESC LIMIT 12`)
}

async function getCategoryDistribution(): Promise<any[]> {
  return getAll(`SELECT c.name, COUNT(n.id) as count FROM categories c LEFT JOIN notes n ON c.id = n.category_id AND n.is_deleted = 0 GROUP BY c.id ORDER BY count DESC`)
}

// ============================================================
// 归档
// ============================================================

async function getArchiveYears(): Promise<number[]> {
  const rows = await getAll<any>("SELECT DISTINCT strftime('%Y', created_at) as year FROM notes WHERE is_deleted = 0 ORDER BY year DESC")
  return rows.map(r => Number(r.year))
}

async function getArchiveMonths(year: number): Promise<number[]> {
  const rows = await getAll<any>("SELECT DISTINCT strftime('%m', created_at) as month FROM notes WHERE is_deleted = 0 AND strftime('%Y', created_at) = ? ORDER BY month DESC", [String(year)])
  return rows.map(r => Number(r.month))
}

// ============================================================
// 回收站
// ============================================================

async function getTrashNotes(): Promise<any[]> {
  return getAll('SELECT * FROM notes WHERE is_deleted = 1 ORDER BY updated_at DESC')
}

async function restoreNote(id: number): Promise<void> {
  await run("UPDATE notes SET is_deleted = 0, updated_at = datetime('now','localtime') WHERE id = ?", [id])
}

async function emptyTrash(): Promise<{ deleted: number }> {
  const deletedNotes = await getAll<{ id: number }>('SELECT id FROM notes WHERE is_deleted = 1')
  if (deletedNotes.length === 0) return { deleted: 0 }
  const ids = deletedNotes.map(n => n.id)
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
  await run(`DELETE FROM note_tags WHERE note_id IN (${placeholders})`, ids)
  await run(`DELETE FROM note_versions WHERE note_id IN (${placeholders})`, ids)
  await run(`DELETE FROM external_files WHERE note_id IN (${placeholders})`, ids)
  const result = await run('DELETE FROM notes WHERE is_deleted = 1')
  return { deleted: result.changes }
}

// ============================================================
// 版本
// ============================================================

async function getNoteVersions(noteId: number): Promise<any[]> {
  return getAll('SELECT * FROM note_versions WHERE note_id = ? ORDER BY version DESC', [noteId])
}

async function restoreVersion(noteId: number, versionId: number): Promise<void> {
  const version = await getOne('SELECT * FROM note_versions WHERE id = ? AND note_id = ?', [versionId, noteId])
  if (version) {
    await run("UPDATE notes SET title = ?, content = ?, content_type = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [version.title, version.content, version.content_type, noteId])
  }
}

// ============================================================
// 导出/导入
// ============================================================

async function exportAllData(): Promise<any> {
  const notes = await getAll('SELECT * FROM notes')
  const categories = await getAll('SELECT * FROM categories')
  const tags = await getAll('SELECT * FROM tags')
  const noteTags = await getAll('SELECT * FROM note_tags')
  const versions = await getAll('SELECT * FROM note_versions')
  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    notes: notes.map((n: any) => ({ ...n, is_favorite: !!n.is_favorite, is_pinned: !!n.is_pinned, is_deleted: !!n.is_deleted })),
    categories, tags, note_tags: noteTags, note_versions: versions
  }
}

async function importAllData(data: any): Promise<any> {
  if (!data || !data.notes) return { success: false, message: '无效的数据格式' }
  let importedNotes = 0, importedCategories = 0, importedTags = 0, importedNoteTags = 0, skippedNotes = 0
  if (data.categories && Array.isArray(data.categories)) {
    for (const cat of data.categories) {
      const exist = await getOne('SELECT id FROM categories WHERE name = ? AND parent_id IS ?', [cat.name, cat.parent_id || null])
      if (!exist) {
        await run('INSERT INTO categories (id, parent_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
          [cat.id, cat.parent_id || null, cat.name, cat.sort_order || 0, cat.created_at || new Date().toISOString()])
        importedCategories++
      }
    }
  }
  if (data.tags && Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      const exist = await getOne('SELECT id FROM tags WHERE name = ?', [tag.name])
      if (!exist) { await run('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', [tag.id, tag.name, tag.color || '#409EFF']); importedTags++ }
    }
  }
  if (data.notes && Array.isArray(data.notes)) {
    for (const note of data.notes) {
      const exist = await getOne('SELECT id FROM notes WHERE id = ?', [note.id])
      if (!exist) {
        await run(`INSERT INTO notes (id, title, content, content_type, category_id, is_favorite, is_pinned, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [note.id, note.title, note.content, note.content_type || 'markdown', note.category_id || null, note.is_favorite ? 1 : 0, note.is_pinned ? 1 : 0, note.is_deleted ? 1 : 0, note.created_at, note.updated_at])
        importedNotes++
      } else { skippedNotes++ }
    }
  }
  if (data.note_tags && Array.isArray(data.note_tags)) {
    for (const nt of data.note_tags) {
      const exist = await getOne('SELECT 1 as e FROM note_tags WHERE note_id = ? AND tag_id = ?', [nt.note_id, nt.tag_id])
      if (!exist) { await run('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)', [nt.note_id, nt.tag_id]); importedNoteTags++ }
    }
  }
  return { success: true, message: `导入完成：${importedNotes} 篇笔记, ${importedCategories} 个分类, ${importedTags} 个标签, ${importedNoteTags} 个关联`, imported_notes: importedNotes, imported_categories: importedCategories, imported_tags: importedTags, imported_note_tags: importedNoteTags, skipped_notes: skippedNotes }
}

async function importMarkdownFiles(files: { name: string; content: string }[]): Promise<any> {
  let count = 0
  for (const f of files) {
    const title = f.name.replace(/\.md$/i, '').replace(/[-_]/g, ' ')
    await run('INSERT INTO notes (title, content, content_type, category_id) VALUES (?, ?, ?, ?)', [title, f.content, 'markdown', null])
    count++
  }
  return { success: true, message: `成功导入 ${count} 个 Markdown 文件`, count }
}

async function clearAllData(): Promise<any> {
  await run('DELETE FROM notes')
  await run('DELETE FROM categories')
  await run('DELETE FROM tags')
  await run('DELETE FROM note_tags')
  await run('DELETE FROM search_history')
  await run('DELETE FROM note_versions')
  return { success: true, message: '所有数据已清除' }
}

async function exportNoteMd(id: number): Promise<any> {
  const note = await getNote(id)
  if (!note) return null
  return { title: note.title, content: `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n---\n\n${note.content}`, type: 'markdown' }
}

async function exportNoteHtml(id: number): Promise<any> {
  const note = await getNote(id)
  if (!note) return null
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${note.title}</title></head><body><pre>${note.content}</pre></body></html>`
  return { title: note.title, content: html, type: 'html' }
}

async function exportCategory(catId: number | null): Promise<any> {
  const allCats = await getAll<any>('SELECT * FROM categories')
  const allNotes = await getAll<any>('SELECT * FROM notes WHERE is_deleted = 0')
  function getAllDescendantIds(rootId: number): Set<number> {
    const ids = new Set<number>([rootId])
    let changed = true
    while (changed) {
      changed = false
      for (const c of allCats) {
        if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) { ids.add(c.id); changed = true }
      }
    }
    return ids
  }
  let filteredNotes
  if (catId === null) {
    filteredNotes = allNotes.filter(n => !n.category_id)
  } else {
    const allDescIds = getAllDescendantIds(catId)
    filteredNotes = allNotes.filter(n => n.category_id && allDescIds.has(n.category_id))
  }
  const catName = catId ? (allCats.find(c => c.id === catId)?.name || '分类') : '未分类'
  const notesData = []
  for (const note of filteredNotes) {
    const tags = await getAll<Tag>('SELECT t.* FROM tags t INNER JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?', [note.id])
    const tagNames = tags.map(t => t.name).join(', ')
    let frontmatter = `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n`
    if (tagNames) frontmatter += `tags: [${tagNames}]\n`
    frontmatter += `---\n\n`
    notesData.push({ filename: `${note.title.replace(/[\\/:*?"<>|]/g, '_')}.md`, content: frontmatter + note.content })
  }
  return { title: catName, notes: notesData, count: filteredNotes.length }
}

async function exportCategoryFolder(catId: number | null): Promise<any> {
  // 简化版：与 exportCategory 类似，图片处理通过 invoke 调用 Rust
  return exportCategory(catId)
}

// ============================================================
// 文件操作（通过 invoke 调用 Rust 命令）
// ============================================================

async function saveLocalFile(data: { buffer: number[]; filename: string; noteId: number }): Promise<any> {
  return invoke('save_local_file', { buffer: data.buffer, filename: data.filename, noteId: data.noteId })
}

async function scanReferencedFiles(): Promise<string[]> {
  return invoke('scan_referenced_files')
}

async function previewUnusedFiles(): Promise<any> {
  return invoke('preview_unused_files')
}

/** 格式化字节大小（B / KB / MB / GB） */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 获取文件空间数据
 *
 * Rust 端负责扫描应用数据目录下的文件列表；
 * 引用关系（referenced / directCategoryId）在此通过查询笔记内容组装：
 * - referenced：任一未删除笔记的 content 中包含该文件名
 * - directCategoryId：第一条引用该文件的笔记所属分类
 *
 * @returns `{ categories, allFiles, totalCount, totalSize, totalSizeFormatted }`
 */
async function getAllFiles(): Promise<any> {
  const files = await invoke<any[]>('get_all_files')

  // 查询所有未删除笔记的内容与分类，用于判断文件引用关系
  const notes = await getAll<{ content: string; category_id: number | null }>(
    'SELECT content, category_id FROM notes WHERE is_deleted = 0'
  )

  // 为每个文件标记引用状态
  const allFiles = files.map((f: any) => {
    const refNote = notes.find(n => n.content && n.content.includes(f.filename))
    return {
      filename: f.filename,
      size: f.size,
      sizeFormatted: f.sizeFormatted,
      modifiedTime: f.modifiedTime,
      referenced: !!refNote,
      directCategoryId: refNote?.category_id ?? null
    }
  })

  // 按分类聚合统计（仅统计直接引用该分类笔记的文件）
  const catMap = new Map<number, { count: number; size: number }>()
  for (const f of allFiles) {
    if (f.directCategoryId != null) {
      const entry = catMap.get(f.directCategoryId) || { count: 0, size: 0 }
      entry.count++
      entry.size += f.size
      catMap.set(f.directCategoryId, entry)
    }
  }
  const catRows = await getAll<{ id: number; parent_id: number | null; name: string; sort_order: number }>(
    'SELECT id, parent_id, name, sort_order FROM categories ORDER BY sort_order'
  )
  const categories = catRows.map(c => {
    const stat = catMap.get(c.id) || { count: 0, size: 0 }
    return {
      id: c.id,
      parent_id: c.parent_id,
      name: c.name,
      sort_order: c.sort_order,
      directFileCount: stat.count,
      directFileSize: stat.size,
      directFileSizeFormatted: formatBytes(stat.size),
      childCategoryCount: catRows.filter(x => x.parent_id === c.id).length
    }
  })

  const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0)
  return {
    categories,
    allFiles,
    totalCount: allFiles.length,
    totalSize,
    totalSizeFormatted: formatBytes(totalSize)
  }
}

async function getFilePath(filename: string): Promise<string> {
  return invoke('get_file_path', { filename })
}

async function readFileAsBase64(filePath: string): Promise<any> {
  return invoke('read_file_as_base64', { filePath })
}

/** 删除应用数据目录下的文件，返回 `{ success, message? }` */
async function deleteFile(filename: string): Promise<any> {
  return invoke('delete_file', { filename })
}

/**
 * 清理未被任何笔记引用的文件
 * 前端组装：扫描文件 → 筛选未引用 → 逐个删除 → 返回统计
 *
 * @returns `{ deletedCount, freedSize, totalSizeFormatted }`
 */
async function cleanUnusedFiles(): Promise<any> {
  const data = await getAllFiles()
  const unused = (data.allFiles as any[]).filter(f => !f.referenced)
  let deletedCount = 0
  let freedSize = 0
  for (const f of unused) {
    const result: any = await invoke('delete_file', { filename: f.filename })
    if (result?.success) {
      deletedCount++
      freedSize += f.size
    }
  }
  return { deletedCount, freedSize, totalSizeFormatted: formatBytes(freedSize) }
}

// ============================================================
// 文件导入（前端组装：Rust 读文件/复制附件 + SQL 创建笔记）
// ============================================================

/** 图片扩展名（导入时复制到附件目录，不创建笔记） */
const IMPORT_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']

/**
 * 导入单个外部文件
 *
 * - 图片：复制到应用附件目录 `amnote-data/files/`，同名冲突时返回 conflict
 * - 文本（md/txt/html 等）：读取内容并创建笔记（标题=文件名去扩展名）
 *
 * @returns `{ success, isImage?, conflict?, filename?, originalPath?, noteId?, error? }`
 */
async function importFile(filePath: string, categoryId: number | null = null): Promise<any> {
  const filename = filePath.split(/[\\/]/).pop() || 'unknown'
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''

  // 图片：复制到附件目录
  if (IMPORT_IMAGE_EXTS.includes(ext)) {
    const result: any = await invoke('copy_file_to_attachments', { sourcePath: filePath, overwrite: false })
    if (result.conflict) {
      return { success: false, conflict: true, filename, originalPath: filePath, isImage: true }
    }
    if (result.success) {
      return { success: true, isImage: true, filename: result.filename }
    }
    return { success: false, error: result.error || '复制失败' }
  }

  // 文本：读取内容创建笔记
  const read: any = await invoke('read_text_file', { filePath })
  if (read.error) {
    return { success: false, error: read.error }
  }
  const title = filename.replace(/\.[^.]+$/, '')
  const noteId = await createNote({
    title,
    content: read.content,
    content_type: ext === 'html' || ext === 'htm' ? 'html' : 'markdown',
    category_id: categoryId
  })
  return { success: true, isImage: false, noteId, filename }
}

/**
 * 导入文件夹（仅第一层文件，跳过子目录与隐藏文件）
 * @returns `{ success, imported, failed, message }`
 */
async function importFolder(folderPath: string, categoryId: number | null = null): Promise<any> {
  const scan: any = await invoke('scan_external_dirs', { parentPath: folderPath })
  if (!scan.success) {
    return { success: false, imported: 0, failed: 0, message: scan.error || '扫描文件夹失败' }
  }

  // scan_external_dirs 树形结构中，第一个虚拟节点 "(文件)" 包含当前目录文件
  const filesNode = (scan.tree as any[]).find(n => n.name === '(文件)')
  const files: any[] = filesNode?.files || []

  let imported = 0
  let failed = 0
  for (const f of files) {
    const result = await importFile(f.path, categoryId)
    if (result.success) imported++
    else failed++
  }
  return { success: true, imported, failed, message: `导入完成：成功 ${imported} 个，失败 ${failed} 个` }
}

/**
 * 解决导入冲突（目前仅图片附件存在冲突场景）
 * @param data.action  'overwrite' 覆盖 | 'skip' 跳过
 */
async function resolveFileConflict(data: { action: string; originalPath: string; filename: string; categoryId: number | null }): Promise<any> {
  if (data.action === 'skip') {
    return { success: true, skipped: true }
  }
  if (data.action === 'overwrite') {
    const result: any = await invoke('copy_file_to_attachments', { sourcePath: data.originalPath, overwrite: true })
    if (result.success) {
      return { success: true, filename: result.filename }
    }
    return { success: false, error: result.error || '覆盖失败' }
  }
  return { success: false, error: `未知操作: ${data.action}` }
}

async function setCurrentViewingPath(path: string | null): Promise<any> {
  return invoke('set_current_viewing_path', { path })
}

async function getCurrentViewingPath(): Promise<any> {
  return invoke('get_current_viewing_path')
}

async function scanExternalDirs(parentPath?: string): Promise<any[]> {
  return invoke('scan_external_dirs', { parentPath })
}

async function openExternalFile(filePath: string): Promise<any> {
  return invoke('open_external_file', { filePath })
}

async function saveExternalFile(filePath: string, base64Content: string): Promise<void> {
  return invoke('save_external_file', { filePath, base64Content })
}

async function createExternalDir(dirPath: string): Promise<void> {
  return invoke('create_external_dir', { dirPath })
}

async function createExternalFile(filePath: string): Promise<void> {
  return invoke('create_external_file', { filePath })
}

async function deleteExternalDir(dirPath: string): Promise<void> {
  return invoke('delete_external_dir', { dirPath })
}

async function deleteExternalFile(filePath: string): Promise<void> {
  return invoke('delete_external_file', { filePath })
}

// ============================================================
// 同步（SFTP）— 暂未实现，返回提示
// ============================================================

async function testSyncConnection(_config: SftpConfig): Promise<any> {
  return { ok: false, message: 'Tauri 版本暂未实现 SFTP 同步' }
}

async function uploadToCloud(_config: SftpConfig): Promise<any> {
  return { ok: false, message: 'Tauri 版本暂未实现 SFTP 同步' }
}

async function downloadFromCloud(_config: SftpConfig): Promise<any> {
  return { ok: false, message: 'Tauri 版本暂未实现 SFTP 同步' }
}

// ============================================================
// MinIO — 暂未实现
// ============================================================

async function testMinioConnection(_config: MinioConfig): Promise<any> {
  return { ok: false, message: 'Tauri 版本暂未实现 MinIO' }
}

async function uploadToMinio(_data: any): Promise<any> {
  return { ok: false, message: 'Tauri 版本暂未实现 MinIO' }
}

// ============================================================
// 对话框
// ============================================================

async function openFileDialog(options: any): Promise<any> {
  const filters = options.filters?.map((f: any) => ({ name: f.name, extensions: f.extensions })) || []
  // 兼容 Electron 风格的 properties 数组
  const properties: string[] = options.properties || []
  const isDirectory = options.directory || properties.includes('openDirectory')
  const isMultiple = options.multiple || properties.includes('multiSelections')
  const result = await openDialog({
    multiple: isMultiple,
    directory: isDirectory,
    filters
  })
  // 将 Tauri 返回格式转换为 Electron 兼容格式
  if (result === null) {
    return { canceled: true, filePaths: [] }
  }
  const filePaths = Array.isArray(result) ? result : [result]
  return { canceled: false, filePaths }
}

// ============================================================
// 应用操作
// ============================================================

async function isDbReady(): Promise<boolean> {
  return dbReady
}

async function quitApp(): Promise<void> {
  await exit()
}

function setCloseBehavior(_behavior: string): void {
  // Tauri 窗口关闭行为通过配置管理，此处空实现
}

async function getDbPath(): Promise<string> {
  return invoke('get_db_path')
}

// ============================================================
// 事件监听（全局搜索、菜单事件等）
// ============================================================

function onGlobalSearch(callback: () => void): () => void {
  let unlisten: UnlistenFn | null = null
  listen('global-search', () => callback()).then(fn => { unlisten = fn })
  return () => { unlisten?.() }
}

function onMenuOpenFolder(callback: () => void): () => void {
  let unlisten: UnlistenFn | null = null
  listen('menu-open-folder', () => callback()).then(fn => { unlisten = fn })
  return () => { unlisten?.() }
}

function onMenuOpenFile(callback: () => void): () => void {
  let unlisten: UnlistenFn | null = null
  listen('menu-open-file', () => callback()).then(fn => { unlisten = fn })
  return () => { unlisten?.() }
}

function onMenuViewStats(callback: () => void): () => void {
  let unlisten: UnlistenFn | null = null
  listen('menu-view-stats', () => callback()).then(fn => { unlisten = fn })
  return () => { unlisten?.() }
}

function onExportProgress(callback: (data: any) => void): () => void {
  let unlisten: UnlistenFn | null = null
  listen('export-progress', (event: any) => callback(event.payload)).then(fn => { unlisten = fn })
  return () => { unlisten?.() }
}

function onDbReady(callback: () => void): () => void {
  if (dbReady) { callback(); return () => {} }
  dbReadyCallbacks.push(callback)
  return () => {
    const idx = dbReadyCallbacks.indexOf(callback)
    if (idx >= 0) dbReadyCallbacks.splice(idx, 1)
  }
}

function onMenuEvent(channel: string, callback: () => void): () => void {
  let unlisten: UnlistenFn | null = null
  listen(channel, () => callback()).then(fn => { unlisten = fn })
  return () => { unlisten?.() }
}

function removeMenuListeners(_channels: string[]): void {
  // Tauri 的事件监听通过返回的 unlisten 函数管理，此处空实现
}

// ============================================================
// 初始化
// ============================================================

async function initDb() {
  try {
    db = await Database.load('sqlite:amnote.db')
    dbReady = true
    console.log('[AmNote] 数据库初始化成功')
    for (const cb of dbReadyCallbacks) cb()
    dbReadyCallbacks.length = 0
  } catch (e) {
    console.error('[AmNote] 数据库初始化失败:', e)
    alert('数据库初始化失败: ' + e + '\n\n请重启应用。')
  }
}

// ============================================================
// 导出 API
// ============================================================

const api = {
  // 笔记
  getNotes, getNote, createNote, updateNote, deleteNote, batchDeleteNotes, duplicateNote,
  renameNote, updateNoteWeight, exportNoteMd, exportNoteHtml,
  // 分类
  getCategories, createCategory, updateCategory, deleteCategory, createSubCategory,
  renameCategory, toggleCategoryFavorite, getFavoriteCategories, moveNoteToCategory,
  moveCategory, exportCategory, exportCategoryFolder,
  // 标签
  getTags, createTag, updateTag, deleteTag, addTagToNote, removeTagFromNote,
  // 搜索
  search, getSearchHistory,
  // 统计
  getStats, getMonthlyTrend, getCategoryDistribution,
  // 归档
  getArchiveYears, getArchiveMonths,
  // 回收站
  getTrashNotes, restoreNote, emptyTrash,
  // 版本
  getNoteVersions, restoreVersion,
  // 导入导出
  exportAllData, importAllData, importMarkdownFiles, clearAllData,
  // 文件
  saveLocalFile, scanReferencedFiles, previewUnusedFiles, getAllFiles, getFilePath,
  readFileAsBase64, deleteFile, cleanUnusedFiles,
  importFile, importFolder, resolveFileConflict, setCurrentViewingPath, getCurrentViewingPath,
  scanExternalDirs, openExternalFile, saveExternalFile, createExternalDir,
  createExternalFile, deleteExternalDir, deleteExternalFile,
  // 同步
  testSyncConnection, uploadToCloud, downloadFromCloud,
  // MinIO
  testMinioConnection, uploadToMinio,
  // 事件
  onGlobalSearch, onMenuOpenFolder, onMenuOpenFile, onMenuViewStats, onExportProgress,
  onDbReady, onMenuEvent, removeMenuListeners,
  // 应用
  isDbReady, quitApp, setCloseBehavior, getDbPath, openFileDialog,
  // 初始化
  _initDb: initDb
}

export type AmNoteAPI = typeof api
export { initDb, api }
