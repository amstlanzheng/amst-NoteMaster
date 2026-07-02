import { contextBridge, ipcRenderer } from 'electron'
import type { Note, Category, Tag, FilterOptions, SftpConfig } from '../shared/types'

const api = {
  getNotes: (filters?: FilterOptions) => ipcRenderer.invoke('db:get-notes', filters),
  getNote: (id: number) => ipcRenderer.invoke('db:get-note', id),
  createNote: (data: Partial<Note>) => ipcRenderer.invoke('db:create-note', data),
  updateNote: (id: number, data: Partial<Note>) => ipcRenderer.invoke('db:update-note', id, data),
  deleteNote: (id: number, permanent?: boolean) => ipcRenderer.invoke('db:delete-note', id, permanent),
  batchDeleteNotes: (ids: number[], permanent?: boolean) => ipcRenderer.invoke('db:batch-delete-notes', ids, permanent),
  duplicateNote: (id: number) => ipcRenderer.invoke('db:duplicate-note', id),
  renameNote: (id: number, newTitle: string) => ipcRenderer.invoke('db:rename-note', id, newTitle),
  updateNoteWeight: (id: number, weight: number) => ipcRenderer.invoke('db:update-note-weight', id, weight),
  exportNoteMd: (id: number) => ipcRenderer.invoke('db:export-note-md', id),
  exportNoteHtml: (id: number) => ipcRenderer.invoke('db:export-note-html', id),

  getCategories: () => ipcRenderer.invoke('db:get-categories'),
  createCategory: (data: Partial<Category>) => ipcRenderer.invoke('db:create-category', data),
  updateCategory: (id: number, data: Partial<Category>) => ipcRenderer.invoke('db:update-category', id, data),
  deleteCategory: (id: number) => ipcRenderer.invoke('db:delete-category', id),
  createSubCategory: (parentId: number, name: string) => ipcRenderer.invoke('db:create-sub-category', parentId, name),
  renameCategory: (id: number, newName: string) => ipcRenderer.invoke('db:rename-category', id, newName),
  toggleCategoryFavorite: (id: number) => ipcRenderer.invoke('db:toggle-category-favorite', id),
  getFavoriteCategories: () => ipcRenderer.invoke('db:get-favorite-categories'),
  moveNoteToCategory: (noteId: number, categoryId: number) => ipcRenderer.invoke('db:move-note-to-category', noteId, categoryId),
  moveCategory: (catId: number, newParentId: number | null) => ipcRenderer.invoke('db:move-category', catId, newParentId),
  exportCategory: (catId: number | null) => ipcRenderer.invoke('db:export-category', catId),
  exportCategoryFolder: (catId: number | null) => ipcRenderer.invoke('db:export-category-folder', catId),

  getTags: () => ipcRenderer.invoke('db:get-tags'),
  createTag: (data: Partial<Tag>) => ipcRenderer.invoke('db:create-tag', data),
  updateTag: (id: number, data: Partial<Tag>) => ipcRenderer.invoke('db:update-tag', id, data),
  deleteTag: (id: number) => ipcRenderer.invoke('db:delete-tag', id),
  addTagToNote: (noteId: number, tagId: number) => ipcRenderer.invoke('db:add-tag-to-note', noteId, tagId),
  removeTagFromNote: (noteId: number, tagId: number) => ipcRenderer.invoke('db:remove-tag-from-note', noteId, tagId),

  search: (keyword: string) => ipcRenderer.invoke('db:search', keyword),
  getSearchHistory: () => ipcRenderer.invoke('db:get-search-history'),

  getStats: () => ipcRenderer.invoke('db:get-stats'),
  getMonthlyTrend: () => ipcRenderer.invoke('db:get-monthly-trend'),
  getCategoryDistribution: () => ipcRenderer.invoke('db:get-category-distribution'),

  getArchiveYears: () => ipcRenderer.invoke('db:get-archive-years'),
  getArchiveMonths: (year: number) => ipcRenderer.invoke('db:get-archive-months', year),

  getTrashNotes: () => ipcRenderer.invoke('db:get-trash-notes'),
  restoreNote: (id: number) => ipcRenderer.invoke('db:restore-note', id),
  emptyTrash: () => ipcRenderer.invoke('db:empty-trash'),

  getNoteVersions: (noteId: number) => ipcRenderer.invoke('db:get-note-versions', noteId),
  restoreVersion: (noteId: number, versionId: number) => ipcRenderer.invoke('db:restore-version', noteId, versionId),

  exportAllData: () => ipcRenderer.invoke('db:export-all'),
  importAllData: (data: any) => ipcRenderer.invoke('db:import-all', data),
  importMarkdownFiles: (files: { name: string; content: string }[]) => ipcRenderer.invoke('db:import-markdown-files', files),
  clearAllData: () => ipcRenderer.invoke('db:clear-all'),

  saveLocalFile: (data: { buffer: number[]; filename: string; noteId: number }) => ipcRenderer.invoke('file:save-local-file', data),
  scanReferencedFiles: () => ipcRenderer.invoke('file:scan-referenced-files'),
  previewUnusedFiles: () => ipcRenderer.invoke('file:preview-unused-files'),
  getAllFiles: () => ipcRenderer.invoke('file:get-all-files'),
  getFilePath: (filename: string) => ipcRenderer.invoke('file:get-file-path', filename),
  readFileAsBase64: (filePath: string) => ipcRenderer.invoke('file:read-as-base64', filePath),
  deleteFile: (filename: string) => ipcRenderer.invoke('file:delete', filename),
  cleanUnusedFiles: () => ipcRenderer.invoke('file:clean-unused-files'),

  // 文件导入相关
  importFile: (filePath: string, categoryId: number | null = null) => ipcRenderer.invoke('file:import-file', filePath, categoryId),
  importFolder: (folderPath: string, categoryId: number | null = null) => ipcRenderer.invoke('file:import-folder', folderPath, categoryId),
  resolveFileConflict: (data: { action: 'overwrite' | 'rename' | 'skip'; originalPath: string; filename: string; categoryId: number | null }) => ipcRenderer.invoke('file:resolve-conflict', data),
  setCurrentViewingPath: (path: string | null) => ipcRenderer.invoke('file:set-current-viewing-path', path),
  getCurrentViewingPath: () => ipcRenderer.invoke('file:get-current-viewing-path'),
  scanExternalDirs: (parentPath?: string) => ipcRenderer.invoke('file:scan-external-dirs', parentPath),
  openExternalFile: (filePath: string) => ipcRenderer.invoke('file:open-external', filePath),
  saveExternalFile: (filePath: string, base64Content: string) => ipcRenderer.invoke('file:save-external', filePath, base64Content),

  testSyncConnection: (config: SftpConfig) => ipcRenderer.invoke('sync:test-connection', config),
  uploadToCloud: (config: SftpConfig) => ipcRenderer.invoke('sync:upload', config),
  downloadFromCloud: (config: SftpConfig) => ipcRenderer.invoke('sync:download', config),

  onGlobalSearch: (callback: () => void) => {
    ipcRenderer.on('global-search', callback)
    return () => ipcRenderer.removeListener('global-search', callback)
  },

  onMenuOpenFolder: (callback: () => void) => {
    ipcRenderer.on('menu-open-folder', callback)
    return () => ipcRenderer.removeListener('menu-open-folder', callback)
  },

  onMenuOpenFile: (callback: () => void) => {
    ipcRenderer.on('menu-open-file', callback)
    return () => ipcRenderer.removeListener('menu-open-file', callback)
  },

  onMenuViewStats: (callback: () => void) => {
    ipcRenderer.on('menu-view-stats', callback)
    return () => ipcRenderer.removeListener('menu-view-stats', callback)
  },

  onExportProgress: (callback: (data: { current: number; total: number; status: string }) => void) => {
    ipcRenderer.on('export-progress', (_event, data) => callback(data))
    return () => ipcRenderer.removeListener('export-progress', callback as any)
  },

  quitApp: () => ipcRenderer.send('app:quit'),

  openFileDialog: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:open-file-dialog', options),

  setCloseBehavior: (behavior: string) => ipcRenderer.send('app:set-close-behavior', behavior),
  
  getDbPath: () => ipcRenderer.invoke('app:get-db-path'),

  // 菜单事件监听
  onMenuEvent: (channel: string, callback: () => void) => {
    ipcRenderer.on(channel, callback)
    return () => ipcRenderer.removeListener(channel, callback)
  },
  removeMenuListeners: (channels: string[]) => {
    channels.forEach(ch => ipcRenderer.removeAllListeners(ch))
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
