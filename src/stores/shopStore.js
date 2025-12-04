import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { supabase } from '../supabase'
import { showToast } from 'vant'

export const useShopStore = defineStore('shop', () => {
  const products = ref(JSON.parse(localStorage.getItem('my-products')) || [])
  const orders = ref(JSON.parse(localStorage.getItem('my-orders')) || [])
  const cart = ref([])
  const isSyncing = ref(false)

  // ... Getters ...
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

  // ... Actions ...
  const initSync = async () => { /* 保持不变 */ }
  const addProduct = async (newProduct) => {
    const index = products.value.findIndex(p => p.barcode === newProduct.barcode)
    if (index !== -1) return false
    products.value.push(newProduct)
    // 异步同步到云端，不阻塞 UI
    supabase.from('products').insert([newProduct]).catch(err => console.warn('Sync failed',HW))
    return true
  }
  const updateProduct = async (updated) => { /* 保持不变 */ 
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
  const removeProduct = async (barcode) => { /* 保持不变 */ 
    products.value = products.value.filter(p => p.barcode !== barcode)
    supabase.from('products').delete().eq('barcode', barcode).then(() => {})
  }
  const restockProduct = async (barcode, amount) => { /* 保持不变 */ 
    const product = products.value.find(p => p.barcode === barcode)
    if (product) {
      product.stock += Number(amount)
      supabase.from('products').update({ stock: product.stock }).eq('barcode', barcode).then(() => {})
    }
  }

  // ★★★ 核心修改：改为前端直接请求，绕过 Supabase 云函数 ★★★
  const enrichProductInfo = async (barcode) => {
    // 1. 请在这里填入你的 Roll API 密钥 (https://www.mxnzp.com/)
    // 警告：在前端暴露密钥有一定风险，但对于个人小项目或演示项目，这是解决网络问题的最快办法
    const APP_ID = 'ulpumjnnphx8kmar';     // <--- 请替换
    const APP_SECRET = 'KEE6tLabuVe02ZZb6ZVVHbmkXjXnnB9l'; // <--- 请替换

    if (APP_ID === '你的APP_ID') {
      console.error('请在 src/stores/shopStore.js 中填入 APP_ID');
      showToast('请配置 API 密钥');
      return null;
    }

    try {
      console.log(`[Direct API] 开始查询: ${barcode}`);
      
      // 2. 直接发起 HTTP 请求
      const url = `https://www.mxnzp.com/api/barcode/goods/details?barcode=${barcode}&app_id=${APP_ID}&app_secret=${APP_SECRET}`;
      
      // 设置 5 秒超时，防止断网时一直卡着
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log("[Direct API] 响应:", data);

      // 3. 处理数据
      if (data.code === 1 && data.data) {
        const goodsName = data.data.goodsName + (data.data.standard ? ` (${data.data.standard})` : '');
        const safePrice = parseFloat(data.data.price) || 0;

        // 更新本地数据
        const product = products.value.find(p => p.barcode === barcode);
        const cartItem = cart.value.find(i => i.barcode === barcode);

        // 如果之前的名字是占位符，就更新它
        if (product) {
            product.name = goodsName;
            product.price = safePrice;
            // 顺便尝试同步这个正确的名字到 Supabase (如果通的话)
            supabase.from('products').upsert({
                barcode, name: goodsName, price: safePrice, stock: product.stock
            }).catch(() => {});
        }
        
        if (cartItem) {
            cartItem.name = goodsName;
            cartItem.price = safePrice;
        }

        return goodsName;
      } else {
        console.warn('API 未找到商品或报错:', data.msg);
        return null;
      }

    } catch (e) {
      console.error('前端直连查询失败:', e);
      // 如果是超时或网络错误
      if (e.name === 'AbortError') {
        showToast('查询超时，网络不畅');
      }
      return null;
    }
  }

  const checkout = async () => { /* 保持不变 */ 
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