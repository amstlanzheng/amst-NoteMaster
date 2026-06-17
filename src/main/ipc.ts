import { ipcMain, dialog, app } from 'electron'
import { getAll, getOne, run, saveDb, getDb, getDbPath, initDatabase } from './database'
import { testSftpConnection, uploadAllToRemote, downloadAllFromRemote, setTempSftpConfig } from './sftp'
import { getMainWindow } from './window'
import { join, basename } from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from 'fs'
import type { Note, Category, Tag, NoteVersion, SearchHistory, FilterOptions, SftpConfig } from '../shared/types'

function registerIpcHandlers() {
  ipcMain.handle('db:get-notes', (_event, filters?: FilterOptions) => {
    let sql = 'SELECT n.* FROM notes n WHERE n.is_deleted = 0'
    const params: any[] = []

    if (filters) {
      if (filters.category_id !== undefined) {
        if (filters.category_id === null) {
          sql += ' AND n.category_id IS NULL'
        } else {
          // 获取当前分类及其所有子分类的 ID
          const allCats = getAll('SELECT * FROM categories') as Category[]
          function getAllDescendantIds(rootId: number): Set<number> {
            const ids = new Set<number>([rootId])
            let changed = true
            while (changed) {
              changed = false
              for (const c of allCats) {
                if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
                  ids.add(c.id)
                  changed = true
                }
              }
            }
            return ids
          }
          
          const categoryIds = getAllDescendantIds(filters.category_id)
          const placeholders = Array.from(categoryIds).map(() => '?').join(',')
          sql += ` AND n.category_id IN (${placeholders})`
          params.push(...Array.from(categoryIds))
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
          // tag_id 为 0 表示筛选无标签的笔记
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

    sql += ' ORDER BY n.is_pinned DESC, n.updated_at DESC'

    const notes = getAll(sql, params)

    return notes.map((note: any) => {
      const tags = getAll('SELECT t.* FROM tags t INNER JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?', [note.id])
      const category = note.category_id ? getOne('SELECT * FROM categories WHERE id = ?', [note.category_id]) : null
      return {
        ...note,
        is_favorite: !!note.is_favorite,
        is_pinned: !!note.is_pinned,
        is_deleted: !!note.is_deleted,
        tags,
        category: category || null
      }
    })
  })

  ipcMain.handle('db:get-note', (_event, id: number) => {
    const note = getOne('SELECT * FROM notes WHERE id = ?', [id])
    if (!note) return null
    return {
      ...note,
      is_favorite: !!note.is_favorite,
      is_pinned: !!note.is_pinned,
      is_deleted: !!note.is_deleted
    }
  })

  ipcMain.handle('db:create-note', (_event, data: Partial<Note>) => {
    const result = run(
      'INSERT INTO notes (title, content, content_type, category_id) VALUES (?, ?, ?, ?)',
      [data.title || '', data.content || '', data.content_type || 'markdown', data.category_id || null]
    )
    return result.lastInsertRowid
  })

  ipcMain.handle('db:update-note', (_event, id: number, data: Partial<Note>) => {
    const fields: string[] = ["updated_at = datetime('now','localtime')"]
    const params: any[] = []

    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title) }
    if (data.content !== undefined) { fields.push('content = ?'); params.push(data.content) }
    if (data.content_type !== undefined) { fields.push('content_type = ?'); params.push(data.content_type) }
    if (data.category_id !== undefined) { fields.push('category_id = ?'); params.push(data.category_id) }
    if (data.is_favorite !== undefined) { fields.push('is_favorite = ?'); params.push(data.is_favorite ? 1 : 0) }
    if (data.is_pinned !== undefined) { fields.push('is_pinned = ?'); params.push(data.is_pinned ? 1 : 0) }
    if (data.is_deleted !== undefined) { fields.push('is_deleted = ?'); params.push(data.is_deleted ? 1 : 0) }

    params.push(id)
    run(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, params)

    if (data.content !== undefined || data.title !== undefined) {
      const current = getOne('SELECT title, content, content_type FROM notes WHERE id = ?', [id])
      if (current) {
        const maxVer = getOne('SELECT COALESCE(MAX(version), 0) as mv FROM note_versions WHERE note_id = ?', [id])
        run('INSERT INTO note_versions (note_id, title, content, content_type, version) VALUES (?, ?, ?, ?, ?)',
          [id, current.title, current.content, current.content_type, (maxVer?.mv || 0) + 1])
      }
    }
  })

  ipcMain.handle('db:delete-note', (_event, id: number, permanent?: boolean) => {
    if (permanent) {
      run('DELETE FROM notes WHERE id = ?', [id])
    } else {
      run("UPDATE notes SET is_deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?", [id])
    }
  })

  ipcMain.handle('db:duplicate-note', (_event, id: number) => {
    const note = getOne('SELECT * FROM notes WHERE id = ?', [id])
    if (!note) return null
    const result = run(
      'INSERT INTO notes (title, content, content_type, category_id, is_favorite, is_pinned) VALUES (?, ?, ?, ?, ?, ?)',
      [note.title + ' (副本)', note.content, note.content_type, note.category_id, 0, 0]
    )
    return result.lastInsertRowid
  })

  ipcMain.handle('db:get-categories', () => {
    const categories = getAll('SELECT * FROM categories ORDER BY sort_order')
    return buildCategoryTree(categories)
  })

  ipcMain.handle('db:create-category', (_event, data: Partial<Category>) => {
    const result = run('INSERT INTO categories (parent_id, name, sort_order) VALUES (?, ?, ?)',
      [data.parent_id || null, data.name || '', data.sort_order || 0])
    return result.lastInsertRowid
  })

  ipcMain.handle('db:update-category', (_event, id: number, data: Partial<Category>) => {
    if (data.sort_order !== undefined) {
      run('UPDATE categories SET sort_order = ? WHERE id = ?', [data.sort_order, id])
    }
    if (data.name !== undefined) {
      run('UPDATE categories SET name = ? WHERE id = ?', [data.name, id])
    }
    if (data.parent_id !== undefined) {
      run('UPDATE categories SET parent_id = ? WHERE id = ?', [data.parent_id, id])
    }
  })

  ipcMain.handle('db:delete-category', (_event, id: number) => {
    run('UPDATE notes SET category_id = NULL WHERE category_id = ?', [id])
    run('DELETE FROM categories WHERE id = ?', [id])
  })

  ipcMain.handle('db:get-tags', () => {
    return getAll('SELECT * FROM tags ORDER BY name')
  })

  ipcMain.handle('db:create-tag', (_event, data: Partial<Tag>) => {
    const result = run('INSERT INTO tags (name, color) VALUES (?, ?)',
      [data.name || '', data.color || '#409EFF'])
    return result.lastInsertRowid
  })

  ipcMain.handle('db:update-tag', (_event, id: number, data: Partial<Tag>) => {
    const fields: string[] = []
    const params: any[] = []
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name) }
    if (data.color !== undefined) { fields.push('color = ?'); params.push(data.color) }
    if (fields.length > 0) {
      params.push(id)
      run(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`, params)
    }
  })

  ipcMain.handle('db:delete-tag', (_event, id: number) => {
    run('DELETE FROM tags WHERE id = ?', [id])
  })

  ipcMain.handle('db:add-tag-to-note', (_event, noteId: number, tagId: number) => {
    const exist = getOne('SELECT 1 as e FROM note_tags WHERE note_id = ? AND tag_id = ?', [noteId, tagId])
    if (!exist) {
      run('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tagId])
    }
  })

  ipcMain.handle('db:remove-tag-from-note', (_event, noteId: number, tagId: number) => {
    run('DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?', [noteId, tagId])
  })

  ipcMain.handle('db:search', (_event, keyword: string) => {
    if (!keyword.trim()) return []
    const escaped = `%${keyword}%`

    run('INSERT INTO search_history (keyword) VALUES (?)', [keyword])

    const results = getAll(
      `SELECT n.* FROM notes n WHERE n.is_deleted = 0 AND (n.title LIKE ? OR n.content LIKE ?) ORDER BY n.updated_at DESC LIMIT 100`,
      [escaped, escaped]
    )

    return results.map((r: any) => {
      const tags = getAll(
        'SELECT t.* FROM tags t INNER JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?',
        [r.id]
      )
      let highlight = (r.content || '').substring(0, 200)
      const idx = highlight.toLowerCase().indexOf(keyword.toLowerCase())
      if (idx >= 0) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(highlight.length, idx + keyword.length + 40)
        let snippet = highlight.substring(start, end)
        if (start > 0) snippet = '...' + snippet
        if (end < highlight.length) snippet += '...'
        const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        snippet = snippet.replace(re, '<mark>$&</mark>')
        highlight = snippet
      }
      return {
        note: {
          ...r,
          is_favorite: !!r.is_favorite,
          is_pinned: !!r.is_pinned,
          is_deleted: !!r.is_deleted,
          tags
        },
        highlight,
        score: 0
      }
    })
  })

  ipcMain.handle('db:get-search-history', () => {
    return getAll('SELECT * FROM search_history ORDER BY searched_at DESC LIMIT 20')
  })

  ipcMain.handle('db:get-stats', () => {
    const total = (getOne("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 0") as any)?.cnt || 0
    const monthNew = (getOne("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 0 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now','localtime')") as any)?.cnt || 0
    const todayNew = (getOne("SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 0 AND date(created_at) = date('now','localtime')") as any)?.cnt || 0
    const catCount = (getOne('SELECT COUNT(*) as cnt FROM categories') as any)?.cnt || 0
    const tagCount = (getOne('SELECT COUNT(*) as cnt FROM tags') as any)?.cnt || 0
    return { total_notes: total, month_new: monthNew, today_new: todayNew, category_count: catCount, tag_count: tagCount }
  })

  ipcMain.handle('db:get-monthly-trend', () => {
    return getAll(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
      FROM notes WHERE is_deleted = 0
      GROUP BY month ORDER BY month DESC LIMIT 12
    `)
  })

  ipcMain.handle('db:get-category-distribution', () => {
    return getAll(`
      SELECT c.name, COUNT(n.id) as count
      FROM categories c
      LEFT JOIN notes n ON c.id = n.category_id AND n.is_deleted = 0
      GROUP BY c.id ORDER BY count DESC
    `)
  })

  ipcMain.handle('db:get-archive-years', () => {
    const rows = getAll("SELECT DISTINCT strftime('%Y', created_at) as year FROM notes WHERE is_deleted = 0 ORDER BY year DESC")
    return rows.map((r: any) => Number(r.year))
  })

  ipcMain.handle('db:get-archive-months', (_event, year: number) => {
    const rows = getAll(
      "SELECT DISTINCT strftime('%m', created_at) as month FROM notes WHERE is_deleted = 0 AND strftime('%Y', created_at) = ? ORDER BY month DESC",
      [String(year)]
    )
    return rows.map((r: any) => Number(r.month))
  })

  ipcMain.handle('db:get-trash-notes', () => {
    return getAll('SELECT * FROM notes WHERE is_deleted = 1 ORDER BY updated_at DESC')
  })

  ipcMain.handle('db:restore-note', (_event, id: number) => {
    run("UPDATE notes SET is_deleted = 0, updated_at = datetime('now','localtime') WHERE id = ?", [id])
  })

  ipcMain.handle('db:get-note-versions', (_event, noteId: number) => {
    return getAll('SELECT * FROM note_versions WHERE note_id = ? ORDER BY version DESC', [noteId])
  })

  ipcMain.handle('db:restore-version', (_event, noteId: number, versionId: number) => {
    const version = getOne('SELECT * FROM note_versions WHERE id = ? AND note_id = ?', [versionId, noteId])
    if (version) {
      run("UPDATE notes SET title = ?, content = ?, content_type = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        [version.title, version.content, version.content_type, noteId])
    }
  })
  ipcMain.handle('db:export-all', () => {
    const notes = getAll('SELECT * FROM notes')
    const categories = getAll('SELECT * FROM categories')
    const tags = getAll('SELECT * FROM tags')
    const noteTags = getAll('SELECT * FROM note_tags')
    const versions = getAll('SELECT * FROM note_versions')

    return {
      version: '1.0',
      exported_at: new Date().toISOString(),
      notes: notes.map((n: any) => ({
        ...n,
        is_favorite: !!n.is_favorite,
        is_pinned: !!n.is_pinned,
        is_deleted: !!n.is_deleted
      })),
      categories,
      tags,
      note_tags: noteTags,
      note_versions: versions
    }
  })

  ipcMain.handle('db:import-all', (_event, data: any) => {
    if (!data || !data.notes) return { success: false, message: '无效的数据格式' }

    try {
      let importedNotes = 0
      let importedCategories = 0
      let importedTags = 0
      let importedNoteTags = 0
      let skippedNotes = 0

      if (data.categories && Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          const exist = getOne('SELECT id FROM categories WHERE name = ? AND parent_id IS ?', [cat.name, cat.parent_id || null])
          if (!exist) {
            run('INSERT INTO categories (id, parent_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
              [cat.id, cat.parent_id || null, cat.name, cat.sort_order || 0, cat.created_at || new Date().toISOString()])
            importedCategories++
          }
        }
      }

      if (data.tags && Array.isArray(data.tags)) {
        for (const tag of data.tags) {
          const exist = getOne('SELECT id FROM tags WHERE name = ?', [tag.name])
          if (!exist) {
            run('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)',
              [tag.id, tag.name, tag.color || '#409EFF'])
            importedTags++
          }
        }
      }

      if (data.notes && Array.isArray(data.notes)) {
        for (const note of data.notes) {
          const exist = getOne('SELECT id FROM notes WHERE id = ?', [note.id])
          if (!exist) {
            run(`INSERT INTO notes (id, title, content, content_type, category_id, is_favorite, is_pinned, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [note.id, note.title, note.content, note.content_type || 'markdown',
                note.category_id || null, note.is_favorite ? 1 : 0, note.is_pinned ? 1 : 0,
                note.is_deleted ? 1 : 0, note.created_at, note.updated_at])
            importedNotes++
          } else {
            skippedNotes++
          }
        }
      }

      if (data.note_tags && Array.isArray(data.note_tags)) {
        for (const nt of data.note_tags) {
          const exist = getOne('SELECT 1 as e FROM note_tags WHERE note_id = ? AND tag_id = ?', [nt.note_id, nt.tag_id])
          if (!exist) {
            run('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)', [nt.note_id, nt.tag_id])
            importedNoteTags++
          }
        }
      }

      return {
        success: true,
        message: `导入完成：${importedNotes} 篇笔记, ${importedCategories} 个分类, ${importedTags} 个标签, ${importedNoteTags} 个关联`,
        imported_notes: importedNotes,
        imported_categories: importedCategories,
        imported_tags: importedTags,
        imported_note_tags: importedNoteTags,
        skipped_notes: skippedNotes
      }
    } catch (e: any) {
      return { success: false, message: '导入失败: ' + (e.message || '未知错误') }
    }
  })

  ipcMain.handle('db:import-markdown-files', (_event, files: { name: string; content: string }[]) => {
    if (!files || !Array.isArray(files) || files.length === 0) {
      return { success: false, message: '没有选择任何文件' }
    }

    let imported = 0
    for (const file of files) {
      const title = file.name.replace(/\.md$/i, '').replace(/[-_]/g, ' ')
      run(
        'INSERT INTO notes (title, content, content_type) VALUES (?, ?, ?)',
        [title, file.content, 'markdown']
      )
      imported++
    }

    return {
      success: true,
      message: `成功导入 ${imported} 个 Markdown 文件`,
      count: imported
    }
  })

  ipcMain.handle('db:clear-all', () => {
    try {
      run('DELETE FROM note_versions')
      run('DELETE FROM note_tags')
      run('DELETE FROM notes')
      run('DELETE FROM tags')
      run('DELETE FROM categories')
      run('DELETE FROM search_history')
      return { success: true, message: '所有数据已清除' }
    } catch (e: any) {
      return { success: false, message: '清除失败: ' + (e.message || '未知错误') }
    }
  })

  ipcMain.handle('db:rename-note', (_event, id: number, newTitle: string) => {
    run('UPDATE notes SET title = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?', [newTitle, id])
  })

  ipcMain.handle('db:export-note-md', (_event, id: number) => {
    const note = getOne('SELECT * FROM notes WHERE id = ?', [id])
    if (!note) return null
    let md = `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n---\n\n${note.content}`
    return { title: note.title, content: md, type: 'markdown' }
  })

  ipcMain.handle('db:export-note-html', (_event, id: number) => {
    const note = getOne('SELECT * FROM notes WHERE id = ?', [id])
    if (!note) return null
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${note.title}</title>
<style>
body{max-width:800px;margin:0 auto;padding:40px 20px;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;line-height:1.8;color:#333}
h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}
pre{background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto}
code{font-family:'Cascadia Code','Fira Code',monospace;font-size:14px}
blockquote{border-left:3px solid #0078d4;padding-left:16px;margin:12px 0;color:#666}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
th{background:#f5f5f5}img{max-width:100%}
</style>
</head>
<body>${note.content_type === 'html' ? note.content : note.content.split('\n').map((l: string) => {
  if (l.startsWith('# ')) return `<h1>${l.slice(2)}</h1>`
  if (l.startsWith('## ')) return `<h2>${l.slice(3)}</h2>`
  if (l.startsWith('### ')) return `<h3>${l.slice(4)}</h3>`
  return `<p>${l}</p>`
}).join('\n')}
</body></html>`
    return { title: note.title, content: html, type: 'html' }
  })

  ipcMain.handle('db:create-sub-category', (_event, parentId: number, name: string) => {
    const maxSort = getOne('SELECT COALESCE(MAX(sort_order), 0) as ms FROM categories WHERE parent_id = ?', [parentId])
    const result = run('INSERT INTO categories (parent_id, name, sort_order) VALUES (?, ?, ?)',
      [parentId, name, (maxSort?.ms || 0) + 1])
    return result.lastInsertRowid
  })

  ipcMain.handle('db:rename-category', (_event, id: number, newName: string) => {
    run('UPDATE categories SET name = ? WHERE id = ?', [newName, id])
  })

  ipcMain.handle('db:toggle-category-favorite', (_event, id: number) => {
    const cat = getOne('SELECT is_favorite FROM categories WHERE id = ?', [id])
    const newVal = cat && (cat as any).is_favorite ? 0 : 1
    run('UPDATE categories SET is_favorite = ? WHERE id = ?', [newVal, id])
    return newVal === 1
  })

  ipcMain.handle('db:get-favorite-categories', () => {
    const cats = getAll('SELECT * FROM categories WHERE is_favorite = 1 ORDER BY sort_order')
    return buildCategoryTree(cats as Category[])
  })

  ipcMain.handle('db:move-note-to-category', (_event, noteId: number, categoryId: number) => {
    run("UPDATE notes SET category_id = ?, updated_at = datetime('now','localtime') WHERE id = ?", [categoryId, noteId])
  })

  ipcMain.handle('db:move-category', (_event, catId: number, newParentId: number | null) => {
    if (newParentId === catId) return
    run('UPDATE categories SET parent_id = ? WHERE id = ?', [newParentId, catId])
  })

  ipcMain.handle('db:export-category', async (_event, catId: number | null) => {
    const allCats = getAll('SELECT * FROM categories') as Category[]
    const allNotes = getAll('SELECT * FROM notes WHERE is_deleted = 0')

    function getAllDescendantIds(rootId: number): Set<number> {
      const ids = new Set<number>([rootId])
      let changed = true
      while (changed) {
        changed = false
        for (const c of allCats) {
          if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
            ids.add(c.id)
            changed = true
          }
        }
      }
      return ids
    }

    // 构建分类路径映射
    function getCategoryPath(categoryId: number): string {
      const path: string[] = []
      let current: any = allCats.find(c => c.id === categoryId)
      while (current) {
        path.unshift(current.name)
        if (current.parent_id) {
          current = allCats.find(c => c.id === current.parent_id)
        } else {
          break
        }
      }
      return path.join('/')
    }

    let filteredNotes
    if (catId === null) {
      filteredNotes = allNotes.filter((n: any) => !n.category_id)
    } else {
      const allDescIds = getAllDescendantIds(catId)
      filteredNotes = allNotes.filter((n: any) => n.category_id && allDescIds.has(n.category_id))
    }

    const catName = catId ? (allCats.find(c => c.id === catId)?.name || '分类') : '未分类'
    const total = filteredNotes.length

    // 发送进度更新
    const win = getMainWindow()
    
    // 构建笔记数据，包含分类路径
    const notesData = filteredNotes.map((note, index) => {
      const tags = getAll('SELECT t.* FROM tags t INNER JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?', [note.id])
      const tagNames = (tags as any[]).map(t => t.name).join(', ')
      let frontmatter = `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n`
      if (tagNames) frontmatter += `tags: [${tagNames}]\n`
      frontmatter += `---\n\n`
      
      // 获取分类路径作为文件夹结构
      const categoryPath = note.category_id ? getCategoryPath(note.category_id) : ''
      
      // 每处理10个笔记发送进度
      if ((index + 1) % 10 === 0 || index === filteredNotes.length - 1) {
        if (win) win.webContents.send('export-progress', { current: index + 1, total, status: 'processing' })
      }
      
      return {
        filename: `${note.title.replace(/[\\/:*?"<>|]/g, '_')}.md`,
        content: frontmatter + note.content,
        categoryPath // 添加分类路径信息
      }
    })

    if (win) win.webContents.send('export-progress', { current: total, total, status: 'complete' })

    return { title: catName, notes: notesData, count: total }
  })

  ipcMain.handle('file:save-local-file', (_event, data: { buffer: number[]; filename: string; noteId: number }) => {
    try {
      const baseDir = existsSync('/notemaster-data') ? '/notemaster-data/files' : join(process.cwd(), 'notemaster-data', 'files')
      if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
      const ext = data.filename.includes('.') ? data.filename.substring(data.filename.lastIndexOf('.')) : '.png'
      const newFilename = `note_${data.noteId}_${Date.now()}${ext}`
      const filePath = join(baseDir, newFilename)
      writeFileSync(filePath, Buffer.from(data.buffer))
      return { path: `notemaster-data/files/${newFilename}` }
    } catch (e: any) {
      return { path: '', error: e.message }
    }
  })

  ipcMain.handle('file:scan-referenced-files', (_event) => {
    const baseDir = existsSync('/notemaster-data') ? '/notemaster-data/files' : join(process.cwd(), 'notemaster-data', 'files')
    if (!existsSync(baseDir)) return []

    const notes = getAll('SELECT content FROM notes WHERE is_deleted = 0')
    const allContent = notes.map((n: any) => n.content || '').join(' ')
    const referenced = new Set<string>()
    const regex = /notemaster-data\/files\/([^\s\)"]+)/g
    let m
    while ((m = regex.exec(allContent)) !== null) {
      if (existsSync(join(baseDir, m[1]))) referenced.add(m[1])
    }

    const allFiles: string[] = []
    function walk(dir: string) {
      const items = readdirSync(dir)
      for (const item of items) {
        const full = join(dir, item)
        if (statSync(full).isDirectory()) walk(full)
        else allFiles.push(item)
      }
    }
    walk(baseDir)

    return allFiles.filter(f => referenced.has(f))
  })

  ipcMain.handle('sync:test-connection', async (_event, config: SftpConfig) => {
    setTempSftpConfig(config)
    return testSftpConnection(config)
  })

  ipcMain.handle('sync:upload', async (_event, config: SftpConfig) => {
    setTempSftpConfig(config)
    const dbFilePath = getDbPath()
    const filesDir = existsSync('/notemaster-data') ? '/notemaster-data/files' : join(process.cwd(), 'notemaster-data', 'files')
    let refs: string[] = []
    if (existsSync(filesDir)) {
      function walkDir(dir: string, base: string): string[] {
        const results: string[] = []
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          const relPath = join(base, entry.name)
          if (entry.isDirectory()) {
            results.push(...walkDir(fullPath, relPath))
          } else {
            results.push(relPath)
          }
        }
        return results
      }
      refs = walkDir(filesDir, '')
    }
    return uploadAllToRemote(config, dbFilePath, filesDir, refs)
  })

  ipcMain.handle('sync:download', async (_event, config: SftpConfig) => {
    setTempSftpConfig(config)
    const localDbPath = getDbPath()
    const filesDir = existsSync('/notemaster-data') ? '/notemaster-data/files' : join(process.cwd(), 'notemaster-data', 'files')
    const result = await downloadAllFromRemote(config, localDbPath, filesDir)
    if (result.ok && result.dbOk) {
      await initDatabase()
    }
    return result
  })

  ipcMain.on('app:quit', () => {
    ;(app as any).isQuitting = true
    app.quit()
  })

  ipcMain.on('app:set-close-behavior', (_event, behavior: string) => {
    ;(app as any)._closeBehavior = behavior
  })

  // 获取数据库文件路径
  ipcMain.handle('app:get-db-path', () => {
    return getDbPath()
  })
}

function buildCategoryTree(categories: Category[]): Category[] {
  const map = new Map<number, Category>()
  const roots: Category[] = []

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] })
  }

  for (const cat of map.values()) {
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!.children!.push(cat)
    } else {
      roots.push({ ...cat, parent_id: cat.parent_id || null })
    }
  }

  return roots
}

export { registerIpcHandlers }
