/**
 * Markdown 渲染工具
 *
 * 基于 markdown-it 提供以下能力：
 * 1. 代码高亮（highlight.js）
 * 2. 外部链接自动在新窗口打开
 * 3. 图片路径转换：
 *    - 内部附件 amnote-data/files/xxx → amnote://files/xxx
 *    - 外部相对路径 → 基于 baseDir 解析为 amnote://local/ 绝对路径协议
 *    - 外部绝对路径 → amnote://local/ 协议
 *
 * 注意：amnote:// 协议图片需由调用方异步加载（见 ExternalFilePreview.vue loadLocalImages）
 */
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

// ============================================================
// MarkdownIt 实例初始化
// ============================================================

const md = new MarkdownIt({
  html: true,        // 允许 HTML 标签
  linkify: false,    // 不自动转换 URL 为链接（避免误识别）
  typographer: true, // 启用排版替换（引号、破折号等）
  breaks: true,      // 换行符转为 <br>
  highlight(str: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // 高亮失败时回退到纯文本
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

// ============================================================
// 自定义链接渲染：外部链接在新窗口打开
// ============================================================

const defaultLinkRender = md.renderer.rules.link_open || function (tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkRender(tokens, idx, options, env, self)
}

// ============================================================
// 自定义图片渲染：路径协议转换
// ============================================================

/** 判断 src 是否为远程/内联路径（不需要协议转换） */
function isRemoteSrc(src: string): boolean {
  return src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('amnote://')
}

/** 基于基准目录解析相对路径为绝对路径 */
function resolvePath(src: string, baseDir: string): string {
  const decodedSrc = decodeURIComponent(src)

  // 已经是绝对路径（Unix / 或 Windows 盘符）
  if (decodedSrc.startsWith('/') || /^[a-zA-Z]:/.test(decodedSrc)) {
    return decodedSrc.replace(/\\/g, '/')
  }

  // 相对路径：按段解析 .. 和 .
  const parts = decodedSrc.split('/')
  const baseParts = baseDir.replace(/\\/g, '/').split('/')
  for (const part of parts) {
    if (part === '..') {
      baseParts.pop()
    } else if (part !== '.') {
      baseParts.push(part)
    }
  }
  return baseParts.join('/')
}

const defaultImageRender = md.renderer.rules.image || function (tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const srcIndex = token.attrIndex('src')

  if (srcIndex >= 0) {
    const src = token.attrs![srcIndex][1]

    if (src.startsWith('amnote-data/files/')) {
      // 内部附件路径 → amnote://files/ 协议
      const relativePath = src.replace('amnote-data/files/', '')
      token.attrs![srcIndex][1] = `amnote://files/${relativePath}`
    } else if (currentBaseDir && !isRemoteSrc(src)) {
      // 外部文件相对/绝对路径 → amnote://local/ 协议
      const resolvedPath = resolvePath(src, currentBaseDir)
      token.attrs![srcIndex][1] = `amnote://local/${resolvedPath.replace(/^\//, '')}`
    }
  }

  return defaultImageRender(tokens, idx, options, env, self)
}

// ============================================================
// 导出函数
// ============================================================

/** 当前渲染的基础目录，用于解析相对路径图片 */
let currentBaseDir = ''

/**
 * 渲染 Markdown 为 HTML
 * @param content  Markdown 源码
 * @param baseDir  外部文件所在目录，用于解析相对路径图片（可选）
 */
export function renderMarkdown(content: string, baseDir?: string): string {
  currentBaseDir = baseDir || ''
  try {
    return md.render(content || '')
  } finally {
    currentBaseDir = ''
  }
}

/**
 * 安全渲染纯文本为 HTML（转义特殊字符，防止 XSS）
 * @param content 纯文本内容
 */
export function renderHtmlSafely(content: string): string {
  const div = document.createElement('div')
  div.textContent = content
  return div.innerHTML
}
