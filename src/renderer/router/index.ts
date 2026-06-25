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
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') }
  ]
})

export default router
