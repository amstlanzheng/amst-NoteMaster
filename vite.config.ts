import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    // importStyle: false —— main.ts 已全量引入 element-plus/dist/index.css，
    // 关闭 resolver 的按需样式注入。否则开发期每访问一个用到新组件的页面，
    // Vite 都要重新预构建一批 element-plus/es/components/*/style/css 并强制整页重载，
    // 会冲掉正在进行中的路由跳转（表现为“点击图标没反应”）。
    AutoImport({ resolvers: [ElementPlusResolver({ importStyle: false })] }),
    Components({ resolvers: [ElementPlusResolver({ importStyle: false })] })
  ],
  resolve: {
    alias: {
      '@': resolve('src'),
      '@shared': resolve('src/shared')
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  }
})
