import { contextBridge, ipcRenderer } from 'electron'
import type { Note, Category, Tag, FilterOptions, SftpConfig } from '../shared/types'

const api = {
  getNotes: (filters?: FilterOptions) => ipcRenderer.invoke('db:get-notes', filters),
  getNote: (id: number) => ipcRenderer.invoke('db:get-note', id),
  createNote: (data: Partial<Note>) => ipcRenderer.invoke('db:create-note', data),
  updateNote: (id: number, data: Partial<Note>) => ipcRenderer.invoke('db:update-note', id, data),
  deleteNote: (id: number, permanent?: boolean) => ipcRenderer.invoke('db:delete-note', id, permanent),
  duplicateNote: (id: number) => ipcRenderer.invoke('db:duplicate-note', id),
  renameNote: (id: number, newTitle: string) => ipcRenderer.invoke('db:rename-note', id, newTitle),
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

  getNoteVersions: (noteId: number) => ipcRenderer.invoke('db:get-note-versions', noteId),
  restoreVersion: (noteId: number, versionId: number) => ipcRenderer.invoke('db:restore-version', noteId, versionId),

  exportAllData: () => ipcRenderer.invoke('db:export-all'),
  importAllData: (data: any) => ipcRenderer.invoke('db:import-all', data),
  importMarkdownFiles: (files: { name: string; content: string }[]) => ipcRenderer.invoke('db:import-markdown-files', files),
  clearAllData: () => ipcRenderer.invoke('db:clear-all'),

  saveLocalFile: (data: { buffer: number[]; filename: string; noteId: number }) => ipcRenderer.invoke('file:save-local-file', data),
  scanReferencedFiles: () => ipcRenderer.invoke('file:scan-referenced-files'),
  cleanUnusedFiles: () => ipcRenderer.invoke('file:clean-unused-files'),

  testSyncConnection: (config: SftpConfig) => ipcRenderer.invoke('sync:test-connection', config),
  uploadToCloud: (config: SftpConfig) => ipcRenderer.invoke('sync:upload', config),
  downloadFromCloud: (config: SftpConfig) => ipcRenderer.invoke('sync:download', config),

  onGlobalSearch: (callback: () => void) => {
    ipcRenderer.on('global-search', callback)
    return () => ipcRenderer.removeListener('global-search', callback)
  },

  onExportProgress: (callback: (data: { current: number; total: number; status: string }) => void) => {
    ipcRenderer.on('export-progress', (_event, data) => callback(data))
    return () => ipcRenderer.removeListener('export-progress', callback as any)
  },

  quitApp: () => ipcRenderer.send('app:quit'),

  setCloseBehavior: (behavior: string) => ipcRenderer.send('app:set-close-behavior', behavior),
  
  getDbPath: () => ipcRenderer.invoke('app:get-db-path')
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
