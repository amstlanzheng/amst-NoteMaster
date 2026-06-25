import { ipcMain, dialog, app, BrowserWindow, shell } from 'electron'
import { getAll, getOne, run, saveDb, getDb, getDbPath, initDatabase } from './database'
import { testSftpConnection, uploadAllToRemote, downloadAllFromRemote, setTempSftpConfig } from './sftp'
import { getMainWindow } from './window'
import { join, basename, dirname } from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, unlinkSync, copyFileSync } from 'fs'
import type { Note, Category, Tag, NoteVersion, SearchHistory, FilterOptions, SftpConfig } from '../shared/types'

// 简单的字符串哈希函数，用于生成临时 ID
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

function registerIpcHandlers() {
  ipcMain.handle('db:get-notes', (_event, filters?: FilterOptions) => {
    let sql = 'SELECT n.* FROM notes n WHERE n.is_deleted = 0'
    const params: any[] = []

    if (filters) {
      if (filters.category_id !== undefined) {
        if (filters.category_id === null) {
          sql += ' AND n.category_id IS NULL'
        } else {
          // 只显示当前分类的直接笔记（不含子分类）
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
    const tree = buildCategoryTree(categories)
    
    // 为每个分类添加直接笔记数量
    function addNoteCount(cats: any[]) {
      cats.forEach(cat => {
        const count = (getOne('SELECT COUNT(*) as cnt FROM notes WHERE category_id = ? AND is_deleted = 0', [cat.id]) as any)?.cnt || 0
        cat.note_count = count
        if (cat.children && cat.children.length > 0) {
          addNoteCount(cat.children)
        }
      })
    }
    addNoteCount(tree)
    
    return tree
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

    // 发送进度通知
    const totalNotes = notes.length
    let processedNotes = 0
    
    // 提取所有笔记中的图片文件
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    const imageFiles = new Set<string>()
    const folderRegex = /amnote-data\/files\/([^\s\)"']+)/g
    
    notes.forEach((note: any) => {
      let m
      while ((m = folderRegex.exec(note.content || '')) !== null) {
        imageFiles.add(m[1])
      }
    })

    // 读取图片文件为 Base64，带进度通知
    const totalImages = imageFiles.size
    let processedImages = 0
    const images = Array.from(imageFiles).filter(filename => {
      const filePath = join(baseDir, filename)
      return existsSync(filePath)
    }).map(filename => {
      const filePath = join(baseDir, filename)
      try {
        const buffer = readFileSync(filePath)
        const base64 = buffer.toString('base64')
        processedImages++
        
        // 每处理10个图片或最后一个图片时发送进度
        if (processedImages % 10 === 0 || processedImages === totalImages) {
          const mainWindow = BrowserWindow.getAllWindows()[0]
          if (mainWindow) {
            mainWindow.webContents.send('export-progress', {
              current: processedImages,
              total: totalImages,
              status: `正在处理图片 ${processedImages}/${totalImages}`
            })
          }
        }
        
        return {
          filename,
          base64,
          path: filePath
        }
      } catch (error) {
        console.error(`Failed to read image ${filename}:`, error)
        return null
      }
    }).filter(img => img !== null) as Array<{ filename: string; base64: string; path: string }>

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
      note_versions: versions,
      images // 添加图片文件列表
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

  ipcMain.handle('db:export-note-md', async (_event, id: number) => {
    const note = getOne('SELECT * FROM notes WHERE id = ?', [id])
    if (!note) return null
    
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    
    // 提取文件夹模式的图片
    const imageFiles = new Set<string>()
    const folderRegex = /amnote-data\/files\/([^\s\)"']+)/g
    let m
    while ((m = folderRegex.exec(note.content || '')) !== null) {
      imageFiles.add(m[1])
    }
    
    // 提取 Base64 图片
    const base64Images: Array<{ filename: string; base64: string }> = []
    const base64Regex = /!\[\]\(data:image\/(\w+);base64,([A-Za-z0-9+/=]+)\)/g
    let b64m
    let b64Index = 0
    while ((b64m = base64Regex.exec(note.content || '')) !== null) {
      const format = b64m[1].toLowerCase()
      const base64Data = b64m[2]
      const filename = `embedded_${Date.now()}_${b64Index++}.${format}`
      base64Images.push({ filename, base64: base64Data })
    }
    
    // 替换图片路径为相对路径
    let content = note.content || ''
    content = content.replace(/amnote-data\/files\/([^\s\)"']+)/g, 'images/$1')
    
    let base64ImageIndex = 0
    content = content.replace(/!\[\]\(data:image\/(\w+);base64,[A-Za-z0-9+/=]+\)/g, () => {
      const img = base64Images[base64ImageIndex++]
      return img ? `![](images/${img.filename})` : ''
    })
    
    let md = `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n---\n\n${content}`
    
    // 准备图片文件列表
    const images = Array.from(imageFiles).filter(filename => {
      const filePath = join(baseDir, filename)
      return existsSync(filePath)
    }).map(filename => {
      const filePath = join(baseDir, filename)
      try {
        const buffer = readFileSync(filePath)
        const base64 = buffer.toString('base64')
        return { filename, base64, path: filePath }
      } catch (error) {
        console.error(`Failed to read image ${filename}:`, error)
        return null
      }
    }).filter(img => img !== null) as Array<{ filename: string; base64: string; path: string }>
    
    // 添加 Base64 转换的图片
    const convertedImages = base64Images.map(img => ({
      filename: img.filename,
      base64: img.base64,
      path: ''
    }))
    
    return { 
      title: note.title, 
      content: md, 
      type: 'markdown',
      images: [...images, ...convertedImages]
    }
  })

  ipcMain.handle('db:export-note-html', async (_event, id: number) => {
    const note = getOne('SELECT * FROM notes WHERE id = ?', [id])
    if (!note) return null
    
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    
    // 提取文件夹模式的图片
    const imageFiles = new Set<string>()
    const folderRegex = /amnote-data\/files\/([^\s\)"']+)/g
    let m
    while ((m = folderRegex.exec(note.content || '')) !== null) {
      imageFiles.add(m[1])
    }
    
    // 提取 Base64 图片
    const base64Images: Array<{ filename: string; base64: string }> = []
    const base64Regex = /!\[\]\(data:image\/(\w+);base64,([A-Za-z0-9+/=]+)\)/g
    let b64m
    let b64Index = 0
    while ((b64m = base64Regex.exec(note.content || '')) !== null) {
      const format = b64m[1].toLowerCase()
      const base64Data = b64m[2]
      const filename = `embedded_${Date.now()}_${b64Index++}.${format}`
      base64Images.push({ filename, base64: base64Data })
    }
    
    // 替换图片路径为相对路径
    let content = note.content || ''
    content = content.replace(/amnote-data\/files\/([^\s\)"']+)/g, 'images/$1')
    
    let base64ImageIndex = 0
    content = content.replace(/!\[\]\(data:image\/(\w+);base64,[A-Za-z0-9+/=]+\)/g, () => {
      const img = base64Images[base64ImageIndex++]
      return img ? `![](images/${img.filename})` : ''
    })
    
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
<body>${note.content_type === 'html' ? content : content.split('\n').map((l: string) => {
  if (l.startsWith('# ')) return `<h1>${l.slice(2)}</h1>`
  if (l.startsWith('## ')) return `<h2>${l.slice(3)}</h2>`
  if (l.startsWith('### ')) return `<h3>${l.slice(4)}</h3>`
  return `<p>${l}</p>`
}).join('\n')}
</body></html>`
    
    // 准备图片文件列表
    const images = Array.from(imageFiles).filter(filename => {
      const filePath = join(baseDir, filename)
      return existsSync(filePath)
    }).map(filename => {
      const filePath = join(baseDir, filename)
      try {
        const buffer = readFileSync(filePath)
        const base64 = buffer.toString('base64')
        return { filename, base64, path: filePath }
      } catch (error) {
        console.error(`Failed to read image ${filename}:`, error)
        return null
      }
    }).filter(img => img !== null) as Array<{ filename: string; base64: string; path: string }>
    
    // 添加 Base64 转换的图片
    const convertedImages = base64Images.map(img => ({
      filename: img.filename,
      base64: img.base64,
      path: ''
    }))
    
    return { 
      title: note.title, 
      content: html, 
      type: 'html',
      images: [...images, ...convertedImages]
    }
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

  // 导出分类为文件夹（包含图片）
  ipcMain.handle('db:export-category-folder', async (_event, catId: number | null) => {
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
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    
    // 提取所有笔记中的图片文件（文件夹模式）
    const imageFiles = new Set<string>()
    const folderRegex = /amnote-data\/files\/([^\s\)"']+)/g
    
    // 提取 Base64 图片并转换为文件
    const base64Images: Array<{ filename: string; base64: string; dataUrl: string }> = []
    const base64Regex = /!\[\]\(data:image\/(\w+);base64,([A-Za-z0-9+/=]+)\)/g
    
    filteredNotes.forEach((note: any) => {
      // 提取文件夹模式的图片
      let m
      while ((m = folderRegex.exec(note.content || '')) !== null) {
        imageFiles.add(m[1])
      }
      
      // 提取 Base64 图片
      let b64m
      let b64Index = 0
      while ((b64m = base64Regex.exec(note.content || '')) !== null) {
        const format = b64m[1].toLowerCase()
        const base64Data = b64m[2]
        const filename = `embedded_${Date.now()}_${b64Index++}.${format}`
        base64Images.push({
          filename,
          base64: base64Data,
          dataUrl: `data:image/${format};base64,${base64Data}`
        })
      }
    })

    // 构建导出数据
    let base64ImageIndex = 0
    const notesData = filteredNotes.map((note: any) => {
      const tags = getAll('SELECT t.* FROM tags t INNER JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?', [note.id])
      const tagNames = (tags as any[]).map(t => t.name).join(', ')
      let frontmatter = `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n`
      if (tagNames) frontmatter += `tags: [${tagNames}]\n`
      frontmatter += `---\n\n`
      
      // 替换图片路径为相对路径
      let content = note.content || ''
      
      // 替换文件夹模式的图片路径
      content = content.replace(/amnote-data\/files\/([^\s\)"']+)/g, 'images/$1')
      
      // 替换 Base64 图片为相对路径引用
      content = content.replace(/!\[\]\(data:image\/(\w+);base64,[A-Za-z0-9+/=]+\)/g, () => {
        const img = base64Images[base64ImageIndex++]
        return img ? `![](images/${img.filename})` : ''
      })
      
      // 不返回 categoryPath,所有 MD 文件都直接放在 ZIP 根目录
      // 这样可以确保相对路径 images/xxx 能正常工作
      
      return {
        filename: `${note.title.replace(/[\\/:*?"<>|]/g, '_')}.md`,
        content: frontmatter + content,
        categoryPath: '' // 强制为空,不使用子文件夹
      }
    })

    // 准备图片文件列表（读取为 Base64）
    const images = Array.from(imageFiles).filter(filename => {
      const filePath = join(baseDir, filename)
      return existsSync(filePath)
    }).map(filename => {
      const filePath = join(baseDir, filename)
      try {
        const buffer = readFileSync(filePath)
        const base64 = buffer.toString('base64')
        return {
          filename,
          base64,
          path: filePath
        }
      } catch (error) {
        console.error(`Failed to read image ${filename}:`, error)
        return null
      }
    }).filter(img => img !== null) as Array<{ filename: string; base64: string; path: string }>
    
    // 添加 Base64 转换的图片
    const convertedImages = base64Images.map(img => ({
      filename: img.filename,
      base64: img.base64,
      path: '' // Base64 图片没有物理路径
    }))

    return { 
      title: catName, 
      notes: notesData, 
      images: [...images, ...convertedImages],
      count: filteredNotes.length 
    }
  })

  ipcMain.handle('file:save-local-file', (_event, data: { buffer: number[]; filename: string; noteId: number }) => {
    try {
      const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
      if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
      
      // 检查文件大小（不超过1MB）
      const fileSize = data.buffer.length
      const maxSize = 1 * 1024 * 1024 // 1MB
      if (fileSize > maxSize) {
        return { path: '', error: `文件大小超过限制（最大1MB），当前大小：${(fileSize / 1024 / 1024).toFixed(2)}MB` }
      }
      
      const ext = data.filename.includes('.') ? data.filename.substring(data.filename.lastIndexOf('.')) : '.png'
      const newFilename = `note_${data.noteId}_${Date.now()}${ext}`
      const filePath = join(baseDir, newFilename)
      writeFileSync(filePath, Buffer.from(data.buffer))
      return { path: `amnote-data/files/${newFilename}` }
    } catch (e: any) {
      return { path: '', error: e.message }
    }
  })

  ipcMain.handle('file:scan-referenced-files', (_event) => {
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    if (!existsSync(baseDir)) return []

    const notes = getAll('SELECT content FROM notes WHERE is_deleted = 0')
    const allContent = notes.map((n: any) => n.content || '').join(' ')
    const referenced = new Set<string>()
    const regex = /amnote-data\/files\/([^\s\)"]+)/g
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

  // 预览未使用的文件（不删除）
  ipcMain.handle('file:preview-unused-files', (_event) => {
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    if (!existsSync(baseDir)) return { unusedFiles: [], totalCount: 0, totalSize: 0 }

    // 获取所有被引用的文件（使用改进的正则）
    const notes = getAll('SELECT content FROM notes WHERE is_deleted = 0')
    const allContent = notes.map((n: any) => n.content || '').join(' ')
    const referenced = new Set<string>()
    
    // 改进的正则：支持更多格式，包括 HTML img 标签
    const regex = /amnote-data\/files\/([^\s\)"'<>]+)/g
    let m
    while ((m = regex.exec(allContent)) !== null) {
      referenced.add(m[1])
    }

    // 扫描所有文件
    const allFiles: Array<{ name: string; path: string; size: number; modifiedTime: Date }> = []
    function walk(dir: string) {
      const items = readdirSync(dir)
      for (const item of items) {
        const full = join(dir, item)
        const stats = statSync(full)
        if (stats.isDirectory()) {
          walk(full)
        } else {
          allFiles.push({ 
            name: item, 
            path: full, 
            size: stats.size,
            modifiedTime: stats.mtime
          })
        }
      }
    }
    walk(baseDir)

    // 找出未引用的文件
    const unusedFiles = allFiles
      .filter(file => !referenced.has(file.name))
      .map(file => ({
        filename: file.name,
        size: file.size,
        sizeFormatted: formatFileSize(file.size),
        modifiedTime: file.modifiedTime.toISOString(),
        path: file.path
      }))

    const totalSize = unusedFiles.reduce((sum, f) => sum + f.size, 0)

    return {
      unusedFiles,
      totalCount: unusedFiles.length,
      totalSize,
      totalSizeFormatted: formatFileSize(totalSize)
    }
  })

  // 获取所有上传的文件列表（用于文件空间显示 - 层级导航模式）
  ipcMain.handle('file:get-all-files', (_event) => {
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    if (!existsSync(baseDir)) return { categories: [], filesByDirectCategory: {}, allFiles: [], totalCount: 0, totalSize: 0, totalSizeFormatted: '0 B' }
  
    // 获取所有分类（含层级关系）
    const allCategories = getAll('SELECT * FROM categories ORDER BY sort_order') as any[]
  
    // 获取所有笔记，用于文件引用检测和分类映射
    const notes = getAll('SELECT n.id, n.content, n.category_id FROM notes n WHERE n.is_deleted = 0')
      
    // 构建文件引用集合
    const allContent = notes.map((n: any) => n.content || '').join(' ')
    const referenced = new Set<string>()
    const regex = /amnote-data\/files\/([^\s)"'<>]+)/g
    let m
    while ((m = regex.exec(allContent)) !== null) {
      referenced.add(m[1])
    }
  
    // 构建文件 -> 直接所属分类ID映射（按笔记的 category_id）
    const fileToDirectCatId = new Map<string, number | null>()
    notes.forEach((note: any) => {
      const noteRegex = /amnote-data\/files\/([^\s)"'<>]+)/g
      let nm
      while ((nm = noteRegex.exec(note.content || '')) !== null) {
        const filename = nm[1]
        if (!fileToDirectCatId.has(filename)) {
          fileToDirectCatId.set(filename, note.category_id || null)
        }
      }
    })
  
    // 扫描所有文件
    const allFiles: Array<{
      filename: string
      size: number
      sizeFormatted: string
      modifiedTime: string
      referenced: boolean
      directCategoryId: number | null
    }> = []
  
    function walk(dir: string) {
      const items = readdirSync(dir)
      for (const item of items) {
        const full = join(dir, item)
        const stat = statSync(full)
        if (stat.isDirectory()) {
          walk(full)
        } else {
          allFiles.push({
            filename: item,
            size: stat.size,
            sizeFormatted: formatFileSize(stat.size),
            modifiedTime: stat.mtime.toISOString(),
            referenced: referenced.has(item),
            directCategoryId: fileToDirectCatId.get(item) !== undefined ? fileToDirectCatId.get(item)! : null
          })
        }
      }
    }
    walk(baseDir)
  
    // 按修改时间排序，最新的在前
    allFiles.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
  
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0)
  
    // 按直接所属分类ID分组文件
    const filesByDirectCategory: Record<string, typeof allFiles> = {}
    const uncategorizedFiles: typeof allFiles = []
    allFiles.forEach(file => {
      if (file.directCategoryId === null || file.directCategoryId === undefined) {
        uncategorizedFiles.push(file)
      } else {
        const key = String(file.directCategoryId)
        if (!filesByDirectCategory[key]) filesByDirectCategory[key] = []
        filesByDirectCategory[key].push(file)
      }
    })
    if (uncategorizedFiles.length > 0) {
      filesByDirectCategory['uncategorized'] = uncategorizedFiles
    }
  
    // 构建分类层级数据（含子分类和文件数量）
    const categories = allCategories.map((cat: any) => {
      const directFiles = filesByDirectCategory[String(cat.id)] || []
      const childCats = allCategories.filter((c: any) => c.parent_id === cat.id)
      return {
        id: cat.id,
        parent_id: cat.parent_id,
        name: cat.name,
        sort_order: cat.sort_order,
        directFileCount: directFiles.length,
        directFileSize: directFiles.reduce((sum: number, f: any) => sum + f.size, 0),
        directFileSizeFormatted: formatFileSize(directFiles.reduce((sum: number, f: any) => sum + f.size, 0)),
        childCategoryCount: childCats.length
      }
    })
  
    return {
      categories,
      filesByDirectCategory,
      allFiles: allFiles.slice(0, 200),
      totalCount: allFiles.length,
      totalSize,
      totalSizeFormatted: formatFileSize(totalSize)
    }
  })

  // 获取文件的完整路径（用于预览）
  ipcMain.handle('file:get-file-path', (_event, filename: string) => {
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    const filePath = join(baseDir, filename)
    if (existsSync(filePath)) {
      return filePath
    }
    return null
  })

  // 读取文件为 Base64（用于图片预览）
  ipcMain.handle('file:read-as-base64', (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) {
        return { error: '文件不存在' }
      }
      const buffer = readFileSync(filePath)
      const base64 = buffer.toString('base64')
      // 根据文件扩展名确定 MIME 类型
      const ext = filePath.split('.').pop()?.toLowerCase()
      let mimeType = 'image/png'
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
      else if (ext === 'gif') mimeType = 'image/gif'
      else if (ext === 'webp') mimeType = 'image/webp'
      else if (ext === 'svg') mimeType = 'image/svg+xml'
      else if (ext === 'bmp') mimeType = 'image/bmp'
      
      return {
        base64: `data:${mimeType};base64,${base64}`
      }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  // 删除文件
  ipcMain.handle('file:delete', (_event, filename: string) => {
    try {
      const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
      const filePath = join(baseDir, filename)
      
      if (!existsSync(filePath)) {
        return { success: false, message: '文件不存在' }
      }
      
      // 检查文件是否被引用
      const notes = getAll('SELECT content FROM notes WHERE is_deleted = 0')
      const allContent = notes.map((n: any) => n.content || '').join(' ')
      const regex = /amnote-data\/files\/([^\s\)"'<>]+)/g
      let m
      while ((m = regex.exec(allContent)) !== null) {
        if (m[1] === filename) {
          return { success: false, message: '文件正在被笔记引用，无法删除' }
        }
      }
      
      // 删除文件
      unlinkSync(filePath)
      return { success: true, message: '文件已删除' }
    } catch (error: any) {
      return { success: false, message: `删除失败: ${error.message}` }
    }
  })

  // 清理未使用的文件（带详细日志）
  ipcMain.handle('file:clean-unused-files', (_event) => {
    const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
    if (!existsSync(baseDir)) return { deletedCount: 0, deletedFiles: [], totalSize: 0, log: [] }

    const log: string[] = []
    const startTime = Date.now()
    log.push(`[${new Date().toISOString()}] 开始扫描未引用文件...`)

    // 获取所有被引用的文件（使用改进的正则）
    const notes = getAll('SELECT content FROM notes WHERE is_deleted = 0')
    const allContent = notes.map((n: any) => n.content || '').join(' ')
    const referenced = new Set<string>()
    
    // 改进的正则：支持更多格式
    const regex = /amnote-data\/files\/([^\s\)"'<>]+)/g
    let m
    while ((m = regex.exec(allContent)) !== null) {
      referenced.add(m[1])
    }
    
    log.push(`找到 ${referenced.size} 个被引用的文件`)

    // 扫描所有文件
    const allFiles: Array<{ name: string; path: string; size: number }> = []
    function walk(dir: string) {
      const items = readdirSync(dir)
      for (const item of items) {
        const full = join(dir, item)
        const stats = statSync(full)
        if (stats.isDirectory()) {
          walk(full)
        } else {
          allFiles.push({ name: item, path: full, size: stats.size })
        }
      }
    }
    walk(baseDir)
    
    log.push(`扫描到 ${allFiles.length} 个文件`)

    // 删除未引用的文件
    const deletedFiles: string[] = []
    let totalSize = 0
    for (const file of allFiles) {
      if (!referenced.has(file.name)) {
        try {
          unlinkSync(file.path)
          deletedFiles.push(file.name)
          totalSize += file.size
          log.push(`已删除: ${file.name} (${formatFileSize(file.size)})`)
        } catch (e: any) {
          const errorMsg = `删除失败 ${file.name}: ${e.message}`
          log.push(errorMsg)
          console.error(errorMsg)
        }
      }
    }

    // 清理空目录
    function cleanEmptyDirs(dir: string) {
      const items = readdirSync(dir)
      for (const item of items) {
        const full = join(dir, item)
        if (statSync(full).isDirectory()) {
          cleanEmptyDirs(full)
          try {
            if (readdirSync(full).length === 0) {
              ;(require('fs') as any).rmdirSync(full)
              log.push(`已删除空目录: ${full.replace(baseDir + '/', '')}`)
            }
          } catch {}
        }
      }
    }
    cleanEmptyDirs(baseDir)

    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)
    log.push(`[${new Date().toISOString()}] 清理完成，耗时 ${duration} 秒`)
    log.push(`共删除 ${deletedFiles.length} 个文件，释放 ${formatFileSize(totalSize)} 空间`)

    return {
      deletedCount: deletedFiles.length,
      deletedFiles,
      totalSize,
      totalSizeFormatted: formatFileSize(totalSize),
      log,
      duration: parseFloat(duration)
    }
  })

// 辅助函数：格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

  ipcMain.handle('sync:test-connection', async (_event, config: SftpConfig) => {
    setTempSftpConfig(config)
    return testSftpConnection(config)
  })

  ipcMain.handle('sync:upload', async (_event, config: SftpConfig) => {
    setTempSftpConfig(config)
    const dbFilePath = getDbPath()
    const filesDir = join(app.getPath('userData'), 'amnote-data', 'files')
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
    
    // 传递进度回调
    const mainWindow = BrowserWindow.getAllWindows()[0]
    return uploadAllToRemote(config, dbFilePath, filesDir, refs, (current, total, status) => {
      if (mainWindow) {
        mainWindow.webContents.send('export-progress', { current, total, status })
      }
    })
  })

  ipcMain.handle('sync:download', async (_event, config: SftpConfig) => {
    setTempSftpConfig(config)
    const localDbPath = getDbPath()
    const filesDir = join(app.getPath('userData'), 'amnote-data', 'files')
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

  // 打开文件/文件夹对话框
  ipcMain.handle('dialog:open-file-dialog', async (_event, options: Electron.OpenDialogOptions) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) {
      return { canceled: true, filePaths: [] }
    }
    
    const result = await dialog.showOpenDialog(mainWindow, options)
    return result
  })

  // 退出应用
  ipcMain.on('app:quit', () => {
    app.quit()
  })

  // 导入单个文件
  ipcMain.handle('file:import-file', async (_event, filePath: string, categoryId: number | null = null) => {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }

      const filename = basename(filePath)
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'))
      
      const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
      if (!existsSync(baseDir)) {
        mkdirSync(baseDir, { recursive: true })
      }
      
      let targetPath = join(baseDir, filename)
      let conflict = false
      
      // 检查是否已存在同名文件
      if (existsSync(targetPath)) {
        conflict = true
        return { 
          success: false, 
          conflict: true, 
          message: `文件 "${filename}" 已存在`,
          existingPath: targetPath,
          originalPath: filePath,
          filename,
          categoryId
        }
      }
      
      // 复制文件
      copyFileSync(filePath, targetPath)
      
      // 获取文件大小
      const stats = statSync(targetPath)
      const size = stats.size
      
      // 创建笔记
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(`.${ext}`)
      let content = ''
      
      if (isImage) {
        content = `# ${nameWithoutExt}\n\n![${nameWithoutExt}](amnote-data/files/${filename})`
      } else {
        content = `# ${nameWithoutExt}\n\n文件：[${filename}](amnote-data/files/${filename})`
      }
      
      const noteResult = run(
        'INSERT INTO notes (title, content, category_id, created_at, updated_at) VALUES (?, ?, ?, datetime("now","localtime"), datetime("now","localtime"))',
        [nameWithoutExt, content, categoryId]
      )
      
      const noteId = noteResult.lastInsertRowid
      
      // 记录到 external_files 表
      run(
        'INSERT INTO external_files (original_path, filename, size, category_id, note_id) VALUES (?, ?, ?, ?, ?)',
        [filePath, filename, size, categoryId, noteId]
      )
      
      return {
        success: true,
        message: '文件导入成功',
        filename,
        noteId,
        isImage
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 导入文件夹中的所有文件
  ipcMain.handle('file:import-folder', async (_event, folderPath: string, categoryId: number | null = null) => {
    try {
      if (!existsSync(folderPath)) {
        return { success: false, error: '文件夹不存在' }
      }

      const results = {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        imageCount: 0,
        errors: [] as string[]
      }

      // 递归扫描文件夹
      function scanDirectory(dir: string) {
        const files = readdirSync(dir)
        
        for (const file of files) {
          const fullPath = join(dir, file)
          const stats = statSync(fullPath)
          
          if (stats.isDirectory()) {
            scanDirectory(fullPath) // 递归处理子文件夹
          } else if (stats.isFile()) {
            results.total++
            
            // 调用 import-file 逻辑
            try {
              const filename = basename(file)
              const ext = filename.split('.').pop()?.toLowerCase() || ''
              const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'))
              
              const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
              if (!existsSync(baseDir)) {
                mkdirSync(baseDir, { recursive: true })
              }
              
              let targetPath = join(baseDir, filename)
              
              // 如果文件已存在，跳过
              if (existsSync(targetPath)) {
                results.skipped++
                continue
              }
              
              copyFileSync(fullPath, targetPath)
              
              const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(`.${ext}`)
              if (isImage) {
                results.imageCount++
              }
              
              let content = ''
              if (isImage) {
                content = `# ${nameWithoutExt}\n\n![${nameWithoutExt}](amnote-data/files/${filename})`
              } else {
                content = `# ${nameWithoutExt}\n\n文件：[${filename}](amnote-data/files/${filename})`
              }
              
              const noteResult = run(
                'INSERT INTO notes (title, content, category_id, created_at, updated_at) VALUES (?, ?, ?, datetime("now","localtime"), datetime("now","localtime"))',
                [nameWithoutExt, content, categoryId]
              )
              
              const noteId = noteResult.lastInsertRowid
              const stats = statSync(targetPath)
              
              run(
                'INSERT INTO external_files (original_path, filename, size, category_id, note_id) VALUES (?, ?, ?, ?, ?)',
                [fullPath, filename, stats.size, categoryId, noteId]
              )
              
              results.success++
            } catch (error: any) {
              results.failed++
              results.errors.push(`${file}: ${error.message}`)
            }
          }
        }
      }
      
      scanDirectory(folderPath)
      
      return {
        success: true,
        results
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 解决文件冲突（覆盖/重命名/跳过）
  ipcMain.handle('file:resolve-conflict', async (_event, data: {
    action: 'overwrite' | 'rename' | 'skip'
    originalPath: string
    filename: string
    categoryId: number | null
  }) => {
    try {
      const { action, originalPath, filename: originalFilename, categoryId } = data
      let filename = originalFilename
      
      if (action === 'skip') {
        return { success: true, skipped: true }
      }
      
      const baseDir = join(app.getPath('userData'), 'amnote-data', 'files')
      let targetPath = join(baseDir, filename)
      
      if (action === 'overwrite') {
        // 删除旧文件
        if (existsSync(targetPath)) {
          unlinkSync(targetPath)
        }
      } else if (action === 'rename') {
        // 生成新文件名
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'))
        const ext = filename.split('.').pop() || ''
        let counter = 1
        let newFilename = filename
        do {
          newFilename = `${nameWithoutExt}(${counter}).${ext}`
          targetPath = join(baseDir, newFilename)
          counter++
        } while (existsSync(targetPath))
        filename = newFilename
      }
      
      // 复制文件
      copyFileSync(originalPath, targetPath)
      
      // 创建笔记（与 import-file 类似）
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'))
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(`.${ext}`)
      let content = ''
      
      if (isImage) {
        content = `# ${nameWithoutExt}\n\n![${nameWithoutExt}](amnote-data/files/${filename})`
      } else {
        content = `# ${nameWithoutExt}\n\n文件：[${filename}](amnote-data/files/${filename})`
      }
      
      const noteResult = run(
        'INSERT INTO notes (title, content, category_id, created_at, updated_at) VALUES (?, ?, ?, datetime("now","localtime"), datetime("now","localtime"))',
        [nameWithoutExt, content, categoryId]
      )
      
      const noteId = noteResult.lastInsertRowid
      const stats = statSync(targetPath)
      
      run(
        'INSERT INTO external_files (original_path, filename, size, category_id, note_id) VALUES (?, ?, ?, ?, ?)',
        [originalPath, filename, stats.size, categoryId, noteId]
      )
      
      return {
        success: true,
        message: '文件导入成功',
        filename,
        noteId,
        isImage
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 添加外部文件记录（不复制文件、不创建笔记，仅记录到 external_files 表）
  ipcMain.handle('file:add-external-files', async (_event, filePaths: string[]) => {
    try {
      const added: Array<{ filename: string; path: string; size: number }> = []
      const skipped: string[] = []

      for (const filePath of filePaths) {
        if (!existsSync(filePath)) {
          skipped.push(filePath)
          continue
        }

        const filename = basename(filePath)
        const stats = statSync(filePath)
        const size = stats.size

        // 检查是否已存在相同路径的记录
        const existing = getOne('SELECT id FROM external_files WHERE original_path = ?', [filePath])
        if (existing) {
          skipped.push(filename)
          continue
        }

        // 只记录到 external_files 表，category_id 和 note_id 为 null
        run(
          'INSERT INTO external_files (original_path, filename, size, category_id, note_id) VALUES (?, ?, ?, NULL, NULL)',
          [filePath, filename, size]
        )
        added.push({ filename, path: filePath, size })
      }

      return { success: true, added, skipped }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 添加外部文件夹记录（递归扫描文件夹，只记录不导入）
  ipcMain.handle('file:add-external-folder', async (_event, folderPath: string) => {
    try {
      if (!existsSync(folderPath)) {
        return { success: false, error: '文件夹不存在' }
      }

      const added: Array<{ filename: string; path: string; size: number }> = []
      const skipped: string[] = []

      function scanDir(dir: string) {
        const entries = readdirSync(dir)
        for (const entry of entries) {
          const fullPath = join(dir, entry)
          const stats = statSync(fullPath)
          if (stats.isDirectory()) {
            scanDir(fullPath)
          } else if (stats.isFile()) {
            const filename = basename(fullPath)
            const existing = getOne('SELECT id FROM external_files WHERE original_path = ?', [fullPath])
            if (existing) {
              skipped.push(filename)
              continue
            }
            run(
              'INSERT INTO external_files (original_path, filename, size, category_id, note_id) VALUES (?, ?, ?, NULL, NULL)',
              [fullPath, filename, stats.size]
            )
            added.push({ filename, path: fullPath, size: stats.size })
          }
        }
      }

      scanDir(folderPath)
      return { success: true, added, skipped }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 获取外部文件列表
  ipcMain.handle('file:get-external-files', () => {
    try {
      const files = getAll('SELECT * FROM external_files ORDER BY imported_at DESC')
      return { success: true, files }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 设置当前查看的文件夹路径
  ipcMain.handle('file:set-current-viewing-path', (_event, path: string | null) => {
    try {
      console.log('[setCurrentViewingPath] Setting path:', path)
      if (path === null || path === '') {
        run('DELETE FROM settings WHERE key = ?', ['current_viewing_path'])
      } else {
        run(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          ['current_viewing_path', path]
        )
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 获取当前查看的文件夹路径
  ipcMain.handle('file:get-current-viewing-path', () => {
    try {
      const result = getOne('SELECT value FROM settings WHERE key = ?', ['current_viewing_path'])
      console.log('[getCurrentViewingPath] Result:', result?.value || null)
      return { success: true, path: result?.value || null }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 【调试】查看所有外部文件记录
  ipcMain.handle('file:debug-all-files', () => {
    try {
      const files = getAll('SELECT id, original_path, filename FROM external_files ORDER BY original_path') as Array<{
        id: number
        original_path: string
        filename: string
      }>
      console.log('[debugAllFiles] Total files:', files.length)
      if (files.length > 0) {
        console.log('[debugAllFiles] Sample paths:', files.slice(0, 5).map(f => f.original_path))
      }
      return { success: true, files }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 扫描外部文件目录结构（懒加载方式 - 直接读取文件系统）
  ipcMain.handle('file:scan-external-dirs', async (_event, parentPath?: string) => {
    try {
      console.log('[scanExternalDirs] parentPath:', parentPath)
      
      if (!parentPath || !existsSync(parentPath)) {
        console.warn('[scanExternalDirs] Path does not exist:', parentPath)
        return { success: true, tree: [] }
      }
      
      // 规范化路径
      const normalizedParent = parentPath.replace(/\\/g, '/')
      console.log('[scanExternalDirs] Scanning directory:', normalizedParent)
      
      // 读取目录内容
      const entries = readdirSync(normalizedParent, { withFileTypes: true })
      
      // 分别收集文件夹和文件
      const folders: Array<{
        name: string
        path: string
        children?: any[]
        hasChildren?: boolean
      }> = []
      
      const files: Array<{
        name: string
        path: string
        children?: any[]
        files?: Array<{
          id: number
          filename: string
          path: string
          size: number
          isImage: boolean
        }>
        hasChildren?: boolean
      }> = []
      
      for (const entry of entries) {
        const fullPath = join(normalizedParent, entry.name)
        
        if (entry.isDirectory()) {
          // 检查子目录是否有内容
          try {
            const subEntries = readdirSync(fullPath)
            const hasChildren = subEntries.length > 0
            
            folders.push({
              name: entry.name,
              path: fullPath.replace(/\\/g, '/'),
              children: [],
              hasChildren: hasChildren
            })
          } catch (err) {
            // 权限问题或其他错误，跳过
            console.warn('[scanExternalDirs] Cannot read directory:', fullPath)
          }
        } else if (entry.isFile()) {
          // 获取文件信息，每个文件作为一个独立的根节点
          try {
            const stats = statSync(fullPath)
            const ext = entry.name.split('.').pop()?.toLowerCase() || ''
            const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(`.${ext}`)
            
            // 使用文件路径的 hash 作为临时 ID
            const tempId = Math.abs(hashCode(fullPath))
            
            // 将文件添加到文件列表
            files.push({
              name: entry.name,
              path: fullPath.replace(/\\/g, '/'),
              children: [],
              files: [{
                id: tempId,
                filename: entry.name,
                path: fullPath.replace(/\\/g, '/'),
                size: stats.size,
                isImage
              }],
              hasChildren: false
            })
          } catch (err) {
            console.warn('[scanExternalDirs] Cannot read file:', fullPath)
          }
        }
      }
      
      // 合并：文件夹在前，文件在后
      const tree = [...folders, ...files]
      
      console.log('[scanExternalDirs] Found', tree.length, 'items')
      return { success: true, tree }
    } catch (error: any) {
      console.error('[scanExternalDirs] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // 用系统默认程序打开外部文件
  ipcMain.handle('file:open-external', async (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }
      const error = await shell.openPath(filePath)
      if (error) {
        return { success: false, error }
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 保存外部文件（写入 Base64 内容）
  ipcMain.handle('file:save-external', async (_event, filePath: string, base64Content: string) => {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }
      
      // 解码 Base64
      const binaryString = atob(base64Content)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // 写入文件
      writeFileSync(filePath, bytes)
      
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 删除外部文件记录
  ipcMain.handle('file:delete-external-file', (_event, id: number) => {
    try {
      run('DELETE FROM external_files WHERE id = ?', [id])
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
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
