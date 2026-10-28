<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import AppLayout from './components/layout/AppLayout.vue'
import GlobalSearchDialog from './components/common/GlobalSearchDialog.vue'
import { useUiStore } from './stores/ui'

const uiStore = useUiStore()

// 全局屏蔽无意义的系统/浏览器默认右键菜单（如网页“另存为”等）。
// 采用捕获阶段监听：
// - 有自定义右键菜单的区域，其处理逻辑照常显示自定义菜单；
// - 输入框 / 文本域 / 富文本可编辑区等保留系统右键（复制、粘贴、剪切、全选）；
// - 其他空白或普通区域右键无反应。
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !(el instanceof HTMLElement)) return false
  // 命中输入控件自身，或位于可编辑容器（含富文本 contenteditable 内部子元素）内
  if (el.closest('input, textarea, select')) return true
  if (el.isContentEditable || el.closest('[contenteditable=""], [contenteditable="true"]')) return true
  return false
}

function suppressDefaultContextMenu(event: MouseEvent) {
  // 编辑控件内放行，保留复制/粘贴等有用的原生右键功能
  if (isEditableTarget(event.target)) return
  event.preventDefault()
}

onMounted(() => {
  uiStore.loadSettings()
  window.addEventListener('contextmenu', suppressDefaultContextMenu, true)
})

onUnmounted(() => {
  window.removeEventListener('contextmenu', suppressDefaultContextMenu, true)
})
</script>

<template>
  <AppLayout />
  <GlobalSearchDialog />
</template>
