<script setup lang="ts">
import type { CategoryContextMenuCtx } from '../../composables/useCategoryContextMenu'

const props = defineProps<{ ctx: CategoryContextMenuCtx }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.ctx.menu.visible"
      class="context-menu-overlay"
      :style="{ left: props.ctx.menu.x + 'px', top: props.ctx.menu.y + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="props.ctx.newSub">
        <el-icon><FolderAdd /></el-icon> 新建子文件夹
      </div>
      <div class="context-menu-item" @click="props.ctx.rename">
        <el-icon><Edit /></el-icon> 重命名
      </div>
      <div class="context-menu-item" @click="props.ctx.toggleFavorite">
        <el-icon><Star /></el-icon>
        {{ props.ctx.menu.cat?.is_favorite ? '取消收藏' : '收藏文件夹' }}
      </div>
      <div class="context-menu-item" @click="props.ctx.exportCategory">
        <el-icon><Download /></el-icon> 导出
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" @click="props.ctx.deleteCat">
        <el-icon><Delete /></el-icon> 删除
      </div>
    </div>
  </Teleport>
</template>
