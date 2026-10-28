/**
 * 路由配置
 *
 * 使用 Hash 模式路由（兼容 Tauri 的 file:// 协议），
 * 所有页面均采用懒加载以优化首屏性能。
 */
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/favorites', name: 'favorites', component: () => import('../views/FavoriteView.vue') },
    { path: '/tags', name: 'tags', component: () => import('../views/TagView.vue') },
    { path: '/search', name: 'search', component: () => import('../views/SearchView.vue') },
    { path: '/trash', name: 'trash', component: () => import('../views/TrashView.vue') },
    { path: '/stats', name: 'stats', component: () => import('../views/StatsView.vue') },
    { path: '/files', name: 'files', component: () => import('../views/FileSpaceView.vue') },
    { path: '/external-preview', name: 'external-preview', component: () => import('../views/ExternalFilePreview.vue') },
    { path: '/ai-assistant', name: 'ai-assistant', component: () => import('../views/AiAssistantView.vue') },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') }
  ]
})

export default router
