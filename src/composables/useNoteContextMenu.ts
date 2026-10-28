import { reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Note } from '@shared/types'
import { useNoteStore } from '../stores/note'

interface NoteMenuState {
  visible: boolean
  x: number
  y: number
  note: Note | null
}

/**
 * 笔记（文件）右键菜单：左侧分类树内文件、中间笔记列表共用。
 * 菜单项：重命名 / 导出 Markdown / 导出 HTML / 设置权重 / 删除
 *
 * @param options.onChanged 重命名/删除等改变文件树数据后触发，用于刷新树
 */
export function useNoteContextMenu(options?: { onChanged?: () => void }) {
  const noteStore = useNoteStore()

  // 用 reactive 而非 ref：该对象会作为 props.ctx.menu 传给菜单组件，
  // 模板对 props.ctx.menu.xxx 的嵌套访问不会自动解包 ref，会永远读不到值
  const menu = reactive<NoteMenuState>({ visible: false, x: 0, y: 0, note: null })

  function open(event: MouseEvent, note: Note) {
    event.preventDefault()
    event.stopPropagation()
    Object.assign(menu, { visible: true, x: event.clientX, y: event.clientY, note })
    setTimeout(() => {
      document.addEventListener('click', close, { once: true })
    }, 0)
  }

  function close() {
    menu.visible = false
  }

  async function rename() {
    const note = menu.note
    if (!note) return
    close()
    try {
      const { value } = await ElMessageBox.prompt('新的笔记名称', '重命名', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: note.title
      })
      if (value?.trim()) {
        await window.api.renameNote(note.id, value.trim())
        await noteStore.fetchNotes()
        if (noteStore.currentNote?.id === note.id) {
          noteStore.currentNote.title = value.trim()
        }
        ElMessage.success('已重命名')
        options?.onChanged?.()
      }
    } catch {
      /* cancel */
    }
  }

  async function exportMd() {
    const note = menu.note
    if (!note) return
    close()
    try {
      const result = await window.api.exportNoteMd(note.id)
      if (result) {
        if (result.images && result.images.length > 0) {
          await exportSingleNoteAsZip(result.title, result.content, result.images)
        } else {
          downloadText(result.content, `${result.title}.md`, 'text/markdown')
        }
      }
    } catch {
      downloadText(
        `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n---\n\n${note.content}`,
        `${note.title}.md`,
        'text/markdown'
      )
    }
    ElMessage.success('Markdown 已导出')
  }

  async function exportHtml() {
    const note = menu.note
    if (!note) return
    close()
    try {
      const result = await window.api.exportNoteHtml(note.id)
      if (result) {
        if (result.images && result.images.length > 0) {
          await exportSingleNoteAsZip(result.title, result.content, result.images)
        } else {
          downloadText(result.content, `${result.title}.html`, 'text/html')
        }
      }
    } catch {
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${note.title}</title><style>body{max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;font-size:16px;line-height:1.8}</style></head><body><pre>${note.content}</pre></body></html>`
      downloadText(html, `${note.title}.html`, 'text/html')
    }
    ElMessage.success('HTML 已导出')
  }

  async function setWeight() {
    const note = menu.note
    if (!note) return
    close()
    try {
      const { value } = await ElMessageBox.prompt('权重数字越小排序越靠前（置顶笔记优先）', '设置权重', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: String(note.sort_weight ?? 999),
        inputPattern: /^-?\d+$/,
        inputErrorMessage: '请输入整数'
      })
      const weight = parseInt(value, 10)
      await window.api.updateNoteWeight(note.id, weight)
      note.sort_weight = weight
      noteStore.fetchNotes()
      ElMessage.success('权重已更新')
    } catch {
      /* cancel */
    }
  }

  async function deleteNote() {
    const note = menu.note
    if (!note) return
    close()
    try {
      await ElMessageBox.confirm(`确定删除「${note.title}」？将移入回收站。`, '删除笔记', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
      await noteStore.deleteNote(note.id)
      ElMessage.success('已移入回收站')
    } catch {
      /* cancel */
    }
  }

  function downloadText(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportSingleNoteAsZip(
    title: string,
    content: string,
    images: Array<{ filename: string; base64: string }>
  ) {
    let JSZip: any
    try {
      const jszipModule = await import('jszip')
      JSZip = jszipModule.default || jszipModule
    } catch {
      if (!(window as any).JSZip) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
          script.onload = () => resolve(true)
          script.onerror = reject
          document.head.appendChild(script)
        })
      }
      JSZip = (window as any).JSZip
    }
    if (!JSZip) throw new Error('JSZip 加载失败')

    const zip = new JSZip()
    zip.file(`${title}.md`, content)
    if (images.length > 0) {
      const imagesFolder = zip.folder('images')
      if (!imagesFolder) throw new Error('创建图片文件夹失败')
      for (const image of images) {
        const binaryString = atob(image.base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let j = 0; j < binaryString.length; j++) {
          bytes[j] = binaryString.charCodeAt(j)
        }
        imagesFolder.file(image.filename, bytes)
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    menu,
    open,
    close,
    rename,
    exportMd,
    exportHtml,
    setWeight,
    deleteNote
  }
}

export type NoteContextMenuCtx = ReturnType<typeof useNoteContextMenu>
