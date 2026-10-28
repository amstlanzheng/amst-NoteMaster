import { reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Category } from '@shared/types'
import { useCategoryStore } from '../stores/category'
import { useNoteStore } from '../stores/note'

interface CatMenuState {
  visible: boolean
  x: number
  y: number
  cat: Category | null
}

/**
 * 分类（文件夹）右键菜单：左侧分类树与中间列表的子文件夹卡片共用，
 * 保证两处菜单项与行为完全一致。
 * 菜单项：新建子文件夹 / 重命名 / 收藏 / 导出 / 删除
 */
export function useCategoryContextMenu() {
  const categoryStore = useCategoryStore()
  const noteStore = useNoteStore()

  // 用 reactive 而非 ref：该对象会作为 props.ctx.menu 传给菜单组件，
  // 模板对 props.ctx.menu.xxx 的嵌套访问不会自动解包 ref，会永远读不到值
  const menu = reactive<CatMenuState>({ visible: false, x: 0, y: 0, cat: null })

  function open(event: MouseEvent, cat: Category) {
    event.preventDefault()
    event.stopPropagation()
    Object.assign(menu, { visible: true, x: event.clientX, y: event.clientY, cat })
    setTimeout(() => {
      document.addEventListener('click', close, { once: true })
    }, 0)
  }

  function close() {
    menu.visible = false
  }

  async function newSub() {
    const cat = menu.cat
    if (!cat) return
    close()
    try {
      const { value } = await ElMessageBox.prompt('子文件夹名称', '新建子文件夹', {
        confirmButtonText: '创建',
        cancelButtonText: '取消'
      })
      if (value?.trim()) {
        await window.api.createSubCategory(cat.id, value.trim())
        await categoryStore.fetchCategories()
        ElMessage.success('子文件夹已创建')
      }
    } catch {
      /* cancel */
    }
  }

  async function rename() {
    const cat = menu.cat
    if (!cat) return
    close()
    try {
      const { value } = await ElMessageBox.prompt('新的分类名称', '重命名', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: cat.name
      })
      if (value?.trim()) {
        await window.api.renameCategory(cat.id, value.trim())
        await categoryStore.fetchCategories()
        ElMessage.success('已重命名')
      }
    } catch {
      /* cancel */
    }
  }

  async function toggleFavorite() {
    const cat = menu.cat
    if (!cat) return
    close()
    await window.api.toggleCategoryFavorite(cat.id)
    await categoryStore.fetchCategories()
    await categoryStore.fetchFavorites()
  }

  async function deleteCat() {
    const cat = menu.cat
    if (!cat) return
    close()
    try {
      await ElMessageBox.confirm(
        `确定删除分类「${cat.name}」？其下的笔记将变为未分类。`,
        '删除分类',
        { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
      )
      await window.api.deleteCategory(cat.id)
      await categoryStore.fetchCategories()
      if (categoryStore.selectedCategoryId === cat.id) {
        categoryStore.selectCategory(null)
        noteStore.clearFilters()
      }
      ElMessage.success('分类已删除')
    } catch {
      /* cancel */
    }
  }

  // 导出为文件夹（Markdown + 图片，打包为 ZIP）
  async function exportCategory() {
    const cat = menu.cat
    if (!cat) return
    close()

    try {
      await ElMessageBox.confirm(
        `将导出分类「${cat.name}」及其所有笔记和图片到 ZIP 压缩包中。`,
        '导出分类',
        {
          confirmButtonText: '开始导出',
          cancelButtonText: '取消',
          type: 'info'
        }
      )

      let progressMsg: any = null
      const handleProgress = (data: { current: number; total: number; status: string }) => {
        if (!progressMsg) {
          progressMsg = ElMessage({
            message: `正在导出 ${cat.name}...`,
            type: 'info',
            duration: 0
          })
        }
        if (data.status === 'complete') {
          progressMsg.close()
          cleanup()
        } else {
          progressMsg.message = `正在导出 ${cat.name}... (${data.current}/${data.total})`
        }
      }
      const cleanup = window.api.onExportProgress(handleProgress)

      try {
        const result = await window.api.exportCategoryFolder(cat.id)
        if (result && result.notes && result.notes.length > 0) {
          await exportAsFolder(result.title, result.notes, result.images || [])
        } else {
          const noteCount = result?.notes?.length || 0
          ElMessage.warning(`该分类下没有找到笔记（共 ${noteCount} 篇）`)
        }
      } finally {
        cleanup()
      }
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error('导出失败：' + (error as Error).message)
      }
    }
  }

  async function exportAsFolder(
    folderName: string,
    notes: Array<{ filename: string; content: string; categoryPath?: string }>,
    images: Array<{ filename: string; base64: string; path: string }>
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
    for (const note of notes) {
      const filePath = note.categoryPath
        ? `${note.categoryPath}/${note.filename}`
        : note.filename
      zip.file(filePath, note.content)
    }

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
    a.download = `${folderName}-${notes.length}篇笔记.zip`
    a.click()
    URL.revokeObjectURL(url)

    ElMessage.success(`已导出文件夹：${folderName}（${notes.length} 篇笔记，${images.length} 张图片）`)
  }

  return {
    menu,
    open,
    close,
    newSub,
    rename,
    toggleFavorite,
    exportCategory,
    deleteCat
  }
}

export type CategoryContextMenuCtx = ReturnType<typeof useCategoryContextMenu>
