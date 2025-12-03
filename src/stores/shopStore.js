import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { supabase } from '../supabase' // 引入 Supabase
import { showToast, showLoadingToast, closeToast } from 'vant'

export const useShopStore = defineStore('shop', () => {
  // --- State ---
  const products = ref(JSON.parse(localStorage.getItem('my-products')) || [])
  const orders = ref(JSON.parse(localStorage.getItem('my-orders')) || [])
  const cart = ref([])
  const isSyncing = ref(false) // 同步状态标记

  // --- Getters (保持不变) ---
  const todaySales = computed(() => {
    const todayStr = new Date().toDateString()
    return orders.value
      .filter(order => new Date(order.date).toDateString() === todayStr)
      .reduce((sum, order) => sum + order.total, 0)
      .toFixed(2)
  })

  const todayOrderCount = computed(() => {
    const todayStr = new Date().toDateString()
    return orders.value.filter(order => new Date(order.date).toDateString() === todayStr).length
  })

  const cartTotal = computed(() => {
    return cart.value.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2)
  })

  // --- Actions: 云端同步核心 ---
  
  // 1. 初始化：从云端拉取数据 (App.vue 挂载时调用)
  const initSync = async () => {
    isSyncing.value = true
    try {
      // 拉取商品
      const { data: remoteProducts } = await supabase.from('products').select('*')
      if (remoteProducts && remoteProducts.length > 0) {
        products.value = remoteProducts
      }

      // 拉取订单 (只取最近100条防止卡顿)
      const { data: remoteOrders } = await supabase.from('orders').select('*').order('date', { ascending: false }).limit(100)
      if (remoteOrders && remoteOrders.length > 0) {
        orders.value = remoteOrders
      }
    } catch (error) {
      console.error('同步失败:', error)
      // 失败了也不要弹窗打扰用户，默默用本地数据就好
    } finally {
      isSyncing.value = false
    }
  }

  // --- Actions: 业务逻辑 (本地+云端双写) ---

  const addProduct = async (newProduct) => {
    // 1. 本地检查
    const index = products.value.findIndex(p => p.barcode === newProduct.barcode)
    if (index !== -1) return false

    // 2. 本地写入 (UI立即更新)
    products.value.push(newProduct)

    // 3. 云端写入 (后台异步)
    supabase.from('products').insert([newProduct]).then(({ error }) => {
      if (error) console.error('云端添加商品失败', error)
    })
    
    return true
  }

  const removeProduct = async (barcode) => {
    // 本地
    products.value = products.value.filter(p => p.barcode !== barcode)
    // 云端
    supabase.from('products').delete().eq('barcode', barcode).then()
  }

  const restockProduct = async (barcode, amount) => {
    const product = products.value.find(p => p.barcode === barcode)
    if (product) {
      product.stock += Number(amount)
      // 云端更新库存
      supabase.from('products').update({ stock: product.stock }).eq('barcode', barcode).then()
    }
  }

  const checkout = async () => {
    if (cart.value.length === 0) return false

    // 1. 检查库存
    for (const item of cart.value) {
      const product = products.value.find(p => p.barcode === item.barcode)
      if (!product || product.stock < item.qty) {
        showToast(`库存不足: ${item.name}`)
        return false
      }
    }

    // 2. 扣库存 & 生成订单 (本地)
    const newOrder = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      items: [...cart.value],
      total: Number(cartTotal.value)
    }

    cart.value.forEach(item => {
      const product = products.value.find(p => p.barcode === item.barcode)
      if (product) {
        product.stock -= item.qty
        // 云端扣库存 (单独更新每个商品，性能略差但逻辑简单)
        supabase.from('products').update({ stock: product.stock }).eq('barcode', item.barcode).then()
      }
    })

    orders.value.unshift(newOrder)
    cart.value = []

    // 3. 订单上传云端
    supabase.from('orders').insert([newOrder]).then(({ error }) => {
      if (error) console.error('订单同步失败', error)
    })

    return true
  }

  const findProduct = (barcode) => {
    return products.value.find(p => p.barcode === barcode)
  }

  // --- 持久化 (保持 LocalStorage 作为兜底) ---
  watch(products, (v) => localStorage.setItem('my-products', JSON.stringify(v)), { deep: true })
  watch(orders, (v) => localStorage.setItem('my-orders', JSON.stringify(v)), { deep: true })

  return { 
    products, cart, orders, isSyncing,
    todaySales, todayOrderCount, cartTotal,
    initSync, // 导出这个新方法
    addProduct, restockProduct, removeProduct, findProduct, checkout
  }
})
