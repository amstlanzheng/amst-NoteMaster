<script setup lang="ts">
import type { NoteContextMenuCtx } from '../../composables/useNoteContextMenu'

const props = defineProps<{ ctx: NoteContextMenuCtx }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.ctx.menu.visible"
      class="context-menu-overlay"
      :style="{ left: props.ctx.menu.x + 'px', top: props.ctx.menu.y + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="props.ctx.rename">
        <el-icon><Edit /></el-icon> 重命名
      </div>
      <div class="context-menu-item" @click="props.ctx.exportMd">
        <el-icon><Document /></el-icon> 导出 Markdown
      </div>
      <div class="context-menu-item" @click="props.ctx.exportHtml">
        <el-icon><Monitor /></el-icon> 导出 HTML
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" @click="props.ctx.setWeight">
        <el-icon><Sort /></el-icon> 设置权重
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" @click="props.ctx.deleteNote">
        <el-icon><Delete /></el-icon> 删除
      </div>
    </div>
  </Teleport>
</template>
