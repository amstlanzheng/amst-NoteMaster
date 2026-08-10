/**
 * AmNote 类型定义
 *
 * 集中管理所有业务实体的 TypeScript 接口，
 * 供 API 层、Store 层、组件层共享使用。
 */

// ============================================================
// 核心业务实体
// ============================================================

/** 笔记 */
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

/** 分类（支持树形结构） */
export interface Category {
  id: number
  parent_id: number | null
  name: string
  sort_order: number
  is_favorite: boolean
  created_at: string
  children?: Category[]
  note_count?: number
}

/** 标签 */
export interface Tag {
  id: number
  name: string
  color: string
}

/** 笔记-标签关联 */
export interface NoteTag {
  note_id: number
  tag_id: number
}

/** 笔记版本（历史记录） */
export interface NoteVersion {
  id: number
  note_id: number
  title: string
  content: string
  content_type: string
  version: number
  created_at: string
}

/** 搜索历史记录 */
export interface SearchHistory {
  id: number
  keyword: string
  searched_at: string
}

/** 搜索结果 */
export interface SearchResult {
  note: Note
  highlight: string
  score: number
}

// ============================================================
// 查询 / 过滤
// ============================================================

/** 笔记过滤选项 */
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
  include_subcategories?: boolean
  sort_by?: 'updated_at' | 'created_at' | 'sort_weight'
  sort_order?: 'asc' | 'desc'
}

// ============================================================
// 统计
// ============================================================

/** 首页统计数据 */
export interface StatsData {
  total_notes: number
  month_new: number
  today_new: number
  category_count: number
  tag_count: number
}

// ============================================================
// 同步配置（暂未实现）
// ============================================================

/** SFTP 同步配置 */
export interface SftpConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  remotePath: string
}

/** 同步导出数据结构 */
export interface SyncExportData {
  categories: any[]
  tags: any[]
  notes: any[]
  note_tags: any[]
}

/** 图片存储模式 */
export type ImageStorageMode = 'base64' | 'folder' | 'minio'

/** MinIO 对象存储配置 */
export interface MinioConfig {
  endPoint: string
  port: number
  accessKey: string
  secretKey: string
  bucket: string
  useSSL: boolean
  pathPrefix: string
}

/** 应用设置 */
export interface AppSettings {
  imageStorageMode: ImageStorageMode
}

// ============================================================
// UI 组件
// ============================================================

/** 右键菜单项 */
export interface ContextMenuItem {
  label: string
  icon?: string
  action: () => void
  divider?: boolean
  danger?: boolean
}
