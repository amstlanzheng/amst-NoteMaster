import dayjs from 'dayjs'

export function formatDate(dateStr: string, format = 'YYYY-MM-DD HH:mm'): string {
  return dayjs(dateStr).format(format)
}

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

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len) + '...'
}

export function stripMarkdown(content: string): string {
  return content
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
}
