import { createApp } from 'vue'
import { createPinia } from 'pinia' // <--- 1. 引入 Pinia
import './style.css'
import App from './App.vue'
import router from './router'
import 'vant/lib/index.css' // <--- 新增：引入 Vant 样式文件

const app = createApp(App)
const pinia = createPinia() // <--- 2. 创建实例

app.use(pinia) // <--- 3. 挂载 Pinia
app.use(router)
app.mount('#app')