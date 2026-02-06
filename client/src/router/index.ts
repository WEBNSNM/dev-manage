import { createRouter, createWebHashHistory } from 'vue-router'
// 引入你的组件
import Dashboard from '../views/dashboard/index.vue'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard
  },
]

const router = createRouter({
  // Electron 推荐用 Hash 模式 (URL带#)，避免打包后路径找不到
  history: createWebHashHistory(),
  routes
})

export default router