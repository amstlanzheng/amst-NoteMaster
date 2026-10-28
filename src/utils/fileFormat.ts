/**
 * 文件类型识别与内容格式化工具（零第三方依赖）
 *
 * - JSON：JSON.parse 校验后缩进
 * - XML / HTML：DOMParser 解析后递归缩进
 * - CSS / SCSS / LESS：按 `{ } ;` 结构换行 + 缩进
 * - C 类语言（JS/TS/Java/C/Go/Rust 等）：仅按括号层级重排「行首缩进」，不改动行内内容，保证语义安全
 */

export type FileKind =
  | 'image' | 'json' | 'xml' | 'html' | 'css' | 'code'
  | 'markdown' | 'text' | 'binary'

/** 图片扩展名 */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']

/** 样式类扩展名 */
const STYLE_EXTS = ['css', 'scss', 'less']

/** C 类语言（基于花括号缩进，重缩进安全） */
const CODE_EXTS = [
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx',
  'java', 'kt', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs',
  'go', 'rs', 'php', 'swift'
]

const EXT_KIND: Record<string, FileKind> = {
  json: 'json',
  xml: 'xml', xsd: 'xml', xsl: 'xml', svg: 'xml',
  html: 'html', htm: 'html',
  md: 'markdown', markdown: 'markdown'
}
for (const e of STYLE_EXTS) EXT_KIND[e] = 'css'
for (const e of CODE_EXTS) EXT_KIND[e] = 'code'
for (const e of ['txt', 'log', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'env', 'sql', 'sh', 'bat', 'ps1', 'py']) {
  EXT_KIND[e] = 'text'
}

/** 取文件扩展名（小写，不含点） */
export function extOf(path: string): string {
  const name = path.split(/[\\/]/).pop() || ''
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

/** 识别文件类别 */
export function detectKind(path: string): FileKind {
  const ext = extOf(path)
  if (IMAGE_EXTS.includes(ext)) return 'image'
  return EXT_KIND[ext] || 'binary'
}

/** 是否为可文本编辑的类型 */
export function isTextEditable(path: string): boolean {
  const kind = detectKind(path)
  return kind !== 'image' && kind !== 'binary'
}

/** 是否支持格式化 */
export function isFormattable(path: string): boolean {
  const kind = detectKind(path)
  return ['json', 'xml', 'html', 'css', 'code'].includes(kind)
}

const INDENT = '  '

/** XML / HTML 缩进美化（基于 DOMParser 校验） */
function prettyMarkup(text: string, mime: 'application/xml' | 'text/html'): string {
  const doc = new DOMParser().parseFromString(text, mime)
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('解析失败：内容不是合法的标记文档')
  }

  const serialize = (node: Node, depth: number): string => {
    const pad = INDENT.repeat(depth)

    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.nodeValue || '').trim()
      return t ? pad + t : ''
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      return `${pad}<!--${node.nodeValue}-->`
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as Element
    const attrs = Array.from(el.attributes).map(a => ` ${a.name}="${a.value}"`).join('')
    const tag = el.tagName
    const children = Array.from(el.childNodes).filter(
      n => !(n.nodeType === Node.TEXT_NODE && !(n.nodeValue || '').trim())
    )

    if (children.length === 0) return `${pad}<${tag}${attrs}></${tag}>`
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
      return `${pad}<${tag}${attrs}>${(children[0].nodeValue || '').trim()}</${tag}>`
    }
    const inner = children.map(c => serialize(c, depth + 1)).filter(Boolean).join('\n')
    return `${pad}<${tag}${attrs}>\n${inner}\n${pad}</${tag}>`
  }

  return Array.from(doc.childNodes)
    .map(n => serialize(n, 0))
    .filter(Boolean)
    .join('\n')
}

/** CSS / SCSS / LESS 格式化：按 { } ; 换行并缩进（跳过字符串与注释） */
function prettyCss(text: string): string {
  const src = text.replace(/\r\n/g, '\n')
  let out = ''
  let depth = 0
  let inComment = false
  let quote: string | null = null
  let pendingSpace = false

  const newline = () => { out = out.replace(/[ \t]+$/, ''); out += '\n' + INDENT.repeat(depth) }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    const next = src[i + 1]

    if (inComment) {
      out += ch
      if (ch === '*' && next === '/') { out += '/'; i++; inComment = false; newline() }
      continue
    }
    if (quote) {
      out += ch
      if (ch === '\\') { out += next ?? ''; i++; continue }
      if (ch === quote) { quote = null; pendingSpace = false }
      continue
    }
    if (ch === '/' && next === '*') { out += '/*'; i++; inComment = true; continue }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; continue }
    if (ch === '\n') { if (pendingSpace) newline(); continue }
    if (ch === ' ' || ch === '\t') { pendingSpace = true; continue }
    if (ch === '{') { out = out.replace(/[ \t]+$/, ''); out += ' {'; depth++; newline(); pendingSpace = false; continue }
    if (ch === '}') { depth = Math.max(0, depth - 1); newline(); out += '}'; newline(); pendingSpace = false; continue }
    if (ch === ';') { out += ';'; newline(); pendingSpace = false; continue }

    if (pendingSpace && out && !out.endsWith('\n') && !out.endsWith(' ')) out += ' '
    pendingSpace = false
    out += ch
  }
  return out.replace(/\n{3,}/g, '\n\n').trimEnd()
}

/**
 * C 类语言安全重缩进：仅改写行首空白，按括号层级计算缩进深度
 * （不改变行内任何字符，therefore 不会破坏代码语义）
 */
function reindentCode(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let depth = 0
  let inBlockComment = false
  let quote: string | null = null
  const out: string[] = []

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (trimmed === '') { out.push(''); continue }

    // 行首连续闭括号数量，用于本行缩进
    let lead = 0
    while (lead < trimmed.length && '}])'.includes(trimmed[lead])) lead++
    out.push(INDENT.repeat(Math.max(0, depth - lead)) + trimmed)

    // 扫描本行，更新括号深度与词法状态
    let i = 0
    while (i < trimmed.length) {
      const ch = trimmed[i]
      const next = trimmed[i + 1]
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; i += 2; continue }
        i++; continue
      }
      if (quote) {
        if (ch === '\\') { i += 2; continue }
        if (ch === quote) quote = null
        i++; continue
      }
      if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue }
      if (ch === '/' && next === '/') break
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; i++; continue }
      if (ch === '{' || ch === '[' || ch === '(') depth++
      else if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
      i++
    }
  }
  return out.join('\n')
}

/**
 * 格式化文件内容，返回格式化后的文本；不支持或失败时抛出带说明的 Error
 */
export function formatContent(content: string, path: string): string {
  const kind = detectKind(path)
  switch (kind) {
    case 'json': {
      try {
        return JSON.stringify(JSON.parse(content), null, 2)
      } catch (e) {
        throw new Error('JSON 解析失败：' + (e as Error).message)
      }
    }
    case 'xml':
      return prettyMarkup(content, 'application/xml')
    case 'html':
      return prettyMarkup(content, 'text/html')
    case 'css':
      return prettyCss(content)
    case 'code':
      return reindentCode(content)
    default:
      throw new Error('该文件类型暂不支持格式化')
  }
}

// ============================================================
// AI 文件操作协议解析
// ============================================================

/** AI 提议的文件操作 */
export interface AiFileAction {
  type: 'write' | 'delete' | 'rename' | 'move'
  path: string
  content?: string
  newPath?: string
  destDir?: string
}

/** 内容片段：普通文本 或 一个文件操作 */
export interface AiContentSegment {
  type: 'text' | 'action'
  text?: string
  action?: AiFileAction
}

const ACTION_BLOCK_RE = /```amnote-action\s*([\s\S]*?)```/g

/** 将回复切分为「文本」与「操作」片段，便于渲染卡片 */
export function splitAiContent(markdown: string): AiContentSegment[] {
  const segments: AiContentSegment[] = []
  ACTION_BLOCK_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = ACTION_BLOCK_RE.exec(markdown)) !== null) {
    const before = markdown.slice(last, m.index)
    if (before.trim()) segments.push({ type: 'text', text: before })

    let action: AiFileAction | null = null
    try {
      const obj = JSON.parse(m[1].trim())
      if (obj && obj.type && obj.path) action = obj as AiFileAction
    } catch { /* ignore */ }

    if (action) segments.push({ type: 'action', action })
    else segments.push({ type: 'text', text: m[0] })

    last = m.index + m[0].length
  }
  const tail = markdown.slice(last)
  if (tail.trim()) segments.push({ type: 'text', text: tail })
  return segments
}

/** 操作的中文描述 */
export function describeAction(action: AiFileAction): string {
  const name = (p: string) => p.split(/[\\/]/).pop() || p
  switch (action.type) {
    case 'write': return `写入文件 ${name(action.path)}`
    case 'delete': return `删除 ${name(action.path)}`
    case 'rename': return `重命名 ${name(action.path)} → ${name(action.newPath || '')}`
    case 'move': return `移动 ${name(action.path)} 到 ${action.destDir || ''}`
    default: return '未知操作'
  }
}
