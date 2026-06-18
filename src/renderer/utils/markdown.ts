import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const md = new MarkdownIt({
  html: true,
  linkify: true,
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

// 自定义图片渲染规则，将 notemaster-data/files/ 路径转换为 notemaster:// 协议
const defaultImageRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.image = function(tokens, idx, options, env, self) {
  const token = tokens[idx]
  const srcIndex = token.attrIndex('src')
  
  if (srcIndex >= 0) {
    let src = token.attrs![srcIndex][1]
    // 将 notemaster-data/files/xxx 转换为 notemaster://files/xxx
    if (src.startsWith('notemaster-data/files/')) {
      const relativePath = src.replace('notemaster-data/files/', '')
      token.attrs![srcIndex][1] = `notemaster://files/${relativePath}`
    }
  }
  
  return defaultImageRender(tokens, idx, options, env, self)
}

export function renderMarkdown(content: string): string {
  return md.render(content || '')
}

export function renderHtmlSafely(content: string): string {
  const div = document.createElement('div')
  div.textContent = content
  return div.innerHTML
}
