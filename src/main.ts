import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {
  Loading, Folder, Document, Top, StarFilled, Edit, Download, Delete,
  Close, View, Picture, Bottom, Search, Sunny, Moon, FolderAdd,
  ArrowDown, ArrowRight, Calendar, Star, Brush, Plus, Upload,
  CollectionTag, DataAnalysis, Setting, FolderOpened, DocumentAdd,
  List, Grid, ArrowUp, ArrowLeft,
  Files, FolderRemove, Clock, PriceTag, CopyDocument, Operation,
  SwitchButton, Rank, Sort, Histogram, Box, Notebook, Memo, Tickets,
  Link, Refresh, Cpu, ChatDotRound, Promotion, VideoPause, MagicStick,
  Connection, Check, User,
  CaretTop, CaretBottom, TopRight, Position, Finished, DeleteFilled, Monitor
} from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { api, initDb } from './api'
import './assets/styles/global.css'

// 将 Tauri API adapter 挂载到 window.api，所有 Vue 组件无需改动
;(window as any).api = api

const app = createApp(App)

const icons: Record<string, any> = {
  Loading, Folder, Document, Top, StarFilled, Edit, Download, Delete,
  Close, View, Picture, Bottom, Search, Sunny, Moon, FolderAdd,
  ArrowDown, ArrowRight, Calendar, Star, Brush, Plus, Upload,
  CollectionTag, DataAnalysis, Setting, FolderOpened, DocumentAdd,
  List, Grid, ArrowUp, ArrowLeft,
  Files, FolderRemove, Clock, PriceTag, CopyDocument, Operation,
  SwitchButton, Rank, Sort, Histogram, Box, Notebook, Memo, Tickets,
  Link, Refresh, Cpu, ChatDotRound, Promotion, VideoPause, MagicStick,
  Connection, Check, User,
  CaretTop, CaretBottom, TopRight, Position, Finished, DeleteFilled, Monitor
}
for (const [key, component] of Object.entries(icons)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 先挂载 UI，再异步初始化数据库（不阻塞界面显示）
app.mount('#app')
initDb()
