import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { supabase } from '../supabase'
import { showToast } from 'vant'

export const useShopStore = defineStore('shop', () => {
  const products = ref(JSON.parse(localStorage.getItem('my-products')) || [])
  const orders = ref(JSON.parse(localStorage.getItem('my-orders')) || [])
  const cart = ref([])
  const isSyncing = ref(false)

  // ... Getters (保持不变) ...
  const todaySales = computed(() => {
    const todayStr = new Date().toDateString()
    return orders.value
      .filter(order => new Date(order.date).toDateString() === todayStr)
      .reduce((sum, order) => sum + order.total, 0).toFixed(2)
  })
  const todayOrderCount = computed(() => {
    const todayStr = new Date().toDateString()
    return orders.value.filter(order => new Date(order.date).toDateString() === todayStr).length
  })
  const cartTotal = computed(() => {
    return cart.value.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2)
  })

  // ... 初始化同步 (Init) (保持不变) ...
  const initSync = async () => {
    isSyncing.value = true
    try {
      const { data: remoteProducts } = await supabase.from('products').select('*')
      if (remoteProducts?.length) products.value = remoteProducts
      
      const { data: remoteOrders } = await supabase.from('orders').select('*').order('date', { ascending: false }).limit(50)
      if (remoteOrders?.length) orders.value = remoteOrders
    } catch (error) {
      console.warn('云端同步跳过 (离线模式)')
    } finally {
      isSyncing.value = false
    }
  }

  // ... Actions (增删改查保持不变) ...
  const addProduct = async (newProduct) => {
    const index = products.value.findIndex(p => p.barcode === newProduct.barcode)
    if (index !== -1) return false
    products.value.push(newProduct)
    supabase.from('products').insert([newProduct]).then(() => {})
    return true
  }

  const updateProduct = async (updated) => {
    const index = products.value.findIndex(p => p.barcode === updated.barcode)
    if (index !== -1) {
      products.value[index] = { ...products.value[index], ...updated }
      const cartItem = cart.value.find(i => i.barcode === updated.barcode)
      if (cartItem) {
        cartItem.name = updated.name
        cartItem.price = updated.price
      }
      const { barcode, ...rest } = updated
      supabase.from('products').update(rest).eq('barcode', barcode).then(() => {})
    }
  }

  const removeProduct = async (barcode) => {
    products.value = products.value.filter(p => p.barcode !== barcode)
    supabase.from('products').delete().eq('barcode', barcode).then(() => {})
  }

  const restockProduct = async (barcode, amount) => {
    const product = products.value.find(p => p.barcode === barcode)
    if (product) {
      product.stock += Number(amount)
      supabase.from('products').update({ stock: product.stock }).eq('barcode', barcode).then(() => {})
    }
  }

  // ★★★ 核心修改：使用 Supabase Edge Function ★★★
  const enrichProductInfo = async (barcode) => {
    try {
      console.log('正在调用云函数查询:', barcode)
      
      // 1. 调用云函数 'fetch-product' (不再直接 fetch 第三方API)
      const { data, error } = await supabase.functions.invoke('fetch-product', {
        body: { barcode }
      })

      if (error) throw error

      // 2. 检查结果
      if (data && data.found) {
        const goodsName = data.name + (data.spec ? ` (${data.spec})` : '')
        const safePrice = parseFloat(data.price) || 0
        
        // 3. 更新本地状态 (Products)
        const productIndex = products.value.findIndex(p => p.barcode === barcode)
        if (productIndex !== -1) {
          const product = products.value[productIndex]
          // 仅当还是占位符时才覆盖
          if (product.name.includes('正在查询') || product.name.includes('未命名')) {
            product.name = goodsName
            product.price = safePrice
            
            // 4. 同步更新购物车 (Cart)
            const cartItem = cart.value.find(i => i.barcode === barcode)
            if (cartItem) {
              cartItem.name = goodsName
              cartItem.price = safePrice
            }

            // 5. 存入 Supabase 数据库
            supabase.from('products').update({ name: goodsName, price: safePrice }).eq('barcode', barcode).then(() => {})
            
            return goodsName
          }
        }
      }
    } catch (e) {
      console.error('云函数调用失败:', e)
    }
    return null
  }

  const checkout = async () => {
    if (cart.value.length === 0) return false
    const newOrder = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      items: [...cart.value],
      total: Number(cartTotal.value)
    }
    cart.value.forEach(item => {
      const p = products.value.find(p => p.barcode === item.barcode)
      if (p) {
        p.stock -= item.qty
        supabase.from('products').update({ stock: p.stock }).eq('barcode', item.barcode).then(() => {})
      }
    })
    orders.value.unshift(newOrder)
    cart.value = []
    supabase.from('orders').insert([newOrder]).then(() => {})
    return true
  }

  const findProduct = (barcode) => products.value.find(p => p.barcode === barcode)

  watch(products, (v) => localStorage.setItem('my-products', JSON.stringify(v)), { deep: true })
  watch(orders, (v) => localStorage.setItem('my-orders', JSON.stringify(v)), { deep: true })

  return {
    products, cart, orders, todaySales, todayOrderCount, cartTotal,
    initSync, addProduct, updateProduct, removeProduct, restockProduct, 
    checkout, findProduct, enrichProductInfo
  }
})