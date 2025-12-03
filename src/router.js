import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import PosView from './views/PosView.vue'
import ProductView from './views/ProductView.vue'
import ReportView from './views/ReportView.vue' // <--- 1. 引入

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/pos', component: PosView },
    { path: '/products', component: ProductView },
    { path: '/report', component: ReportView }, // <--- 2. 配置
  ]
})

export default router


