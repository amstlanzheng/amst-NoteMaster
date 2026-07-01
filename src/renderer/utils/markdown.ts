import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: true,
  breaks: true,
  highlight(str: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // fall through
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

// 自定义链接渲染规则：为外部链接添加 target="_blank" 和 rel="noopener"
const defaultLinkRender = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
  const token = tokens[idx]
  // 为所有链接添加在新窗口打开的属性
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkRender(tokens, idx, options, env, self)
}

// 当前渲染的基础目录，用于解析相对路径图片
let currentBaseDir = ''

// 自定义图片渲染规则，将 amnote-data/files/ 路径转换为 amnote:// 协议
// 同时将相对路径图片解析为基于 baseDir 的绝对路径
const defaultImageRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.image = function(tokens, idx, options, env, self) {
  const token = tokens[idx]
  const srcIndex = token.attrIndex('src')
  
  if (srcIndex >= 0) {
    let src = token.attrs![srcIndex][1]
    // 将 amnote-data/files/xxx 转换为 amnote://files/xxx
    if (src.startsWith('amnote-data/files/')) {
      const relativePath = src.replace('amnote-data/files/', '')
      token.attrs![srcIndex][1] = `amnote://files/${relativePath}`
    } else if (currentBaseDir && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('amnote://')) {
      // 相对路径图片：基于 baseDir 解析为绝对路径，使用 amnote://local/ 协议
      const decodedSrc = decodeURIComponent(src)
      let resolvedPath: string
      if (decodedSrc.startsWith('/') || /^[a-zA-Z]:/.test(decodedSrc)) {
        // 绝对路径
        resolvedPath = decodedSrc
      } else {
        // 相对路径：基于 baseDir 解析
        const parts = decodedSrc.split('/')
        const baseParts = currentBaseDir.split('/')
        for (const part of parts) {
          if (part === '..') {
            baseParts.pop()
          } else if (part !== '.') {
            baseParts.push(part)
          }
        }
        resolvedPath = baseParts.join('/')
      }
      // Windows 路径需要正斜杠
      resolvedPath = resolvedPath.replace(/\\/g, '/')
      token.attrs![srcIndex][1] = `amnote://local/${resolvedPath.replace(/^\//, '')}`
    }
  }
  
  return defaultImageRender(tokens, idx, options, env, self)
}

export function renderMarkdown(content: string, baseDir?: string): string {
  currentBaseDir = baseDir || ''
  try {
    return md.render(content || '')
  } finally {
    currentBaseDir = ''
  }
}

export function renderHtmlSafely(content: string): string {
  const div = document.createElement('div')
  div.textContent = content
  return div.innerHTML
}
