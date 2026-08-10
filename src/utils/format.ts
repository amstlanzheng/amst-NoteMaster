/**
 * 格式化工具
 *
 * 提供日期格式化、相对时间、文本截断、Markdown 清理等通用工具函数
 */
import dayjs from 'dayjs'

/**
 * 格式化日期字符串
 * @param dateStr  日期字符串（ISO 格式或数据库 datetime 格式）
 * @param format   dayjs 格式模板，默认 'YYYY-MM-DD HH:mm'
 */
export function formatDate(dateStr: string, format = 'YYYY-MM-DD HH:mm'): string {
  return dayjs(dateStr).format(format)
}

/**
 * 格式化相对时间（如"3分钟前"、"2天前"）
 * @param dateStr 日期字符串
 */
export function formatRelative(dateStr: string): string {
  const d = dayjs(dateStr)
  const now = dayjs()
  const diffMins = now.diff(d, 'minute')

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`

  const diffHours = now.diff(d, 'hour')
  if (diffHours < 24) return `${diffHours}小时前`

  const diffDays = now.diff(d, 'day')
  if (diffDays < 30) return `${diffDays}天前`

  return d.format('YYYY-MM-DD')
}

/**
 * 截断字符串，超出部分用省略号代替
 * @param str 原始字符串
 * @param len 最大长度
 */
export function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len) + '...'
}

/**
 * 去除 Markdown 标记，提取纯文本
 * 用于笔记列表预览、搜索摘要等场景
 * @param content Markdown 源码
 */
export function stripMarkdown(content: string): string {
  return content
    .replace(/#{1,6}\s/g, '')           // 标题标记
    .replace(/\*\*(.+?)\*\*/g, '$1')     // 粗体
    .replace(/\*(.+?)\*/g, '$1')         // 斜体
    .replace(/`{1,3}[^`]*`{1,3}/g, '')   // 行内/块级代码
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接文本
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // 图片 alt
    .replace(/>\s/g, '')                 // 引用标记
    .replace(/[-*+]\s/g, '')             // 无序列表标记
    .replace(/\n{2,}/g, ' ')            // 多换行合并为空格
    .trim()
}
