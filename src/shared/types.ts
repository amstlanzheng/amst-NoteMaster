export interface Note {
  id: number
  title: string
  content: string
  content_type: 'markdown' | 'html'
  category_id: number | null
  is_favorite: boolean
  is_pinned: boolean
  is_deleted: boolean
  sort_weight: number
  created_at: string
  updated_at: string
  tags?: Tag[]
  category?: Category
}

export interface Category {
  id: number
  parent_id: number | null
  name: string
  sort_order: number
  is_favorite: boolean
  created_at: string
  children?: Category[]
  note_count?: number // 直接笔记数量
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface NoteTag {
  note_id: number
  tag_id: number
}

export interface NoteVersion {
  id: number
  note_id: number
  title: string
  content: string
  content_type: string
  version: number
  created_at: string
}

export interface SearchHistory {
  id: number
  keyword: string
  searched_at: string
}

export interface SearchResult {
  note: Note
  highlight: string
  score: number
}

export interface FilterOptions {
  category_id?: number | null
  tag_id?: number | null
  date_from?: string
  date_to?: string
  is_favorite?: boolean
  is_pinned?: boolean
  year?: number
  month?: number
  keyword?: string
  sort_by?: 'updated_at' | 'created_at' | 'sort_weight'
  sort_order?: 'asc' | 'desc'
}

export interface StatsData {
  total_notes: number
  month_new: number
  today_new: number
  category_count: number
  tag_count: number
}

export interface SftpConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  remotePath: string
}

export interface SyncExportData {
  categories: any[]
  tags: any[]
  notes: any[]
  note_tags: any[]
}

export interface ContextMenuItem {
  label: string
  icon?: string
  action: () => void
  divider?: boolean
  danger?: boolean
}

// 图片存储模式
export type ImageStorageMode = 'base64' | 'folder'

// 应用设置
export interface AppSettings {
  imageStorageMode: ImageStorageMode
}
