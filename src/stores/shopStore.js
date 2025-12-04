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
    supabase.from('products').insert([newProduct]).catch(err => console.warn('Sync failed'))
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

  // ★★★ 核心修改：增加 CORS 代理 + 详细错误提示 ★★★
  const enrichProductInfo = async (barcode) => {
    // 1. 请务必确认这里的 ID 和 Secret 是否已替换为你自己的
    const APP_ID = 'ulpumjnnphx8kmar';     // <--- 请替换
    const APP_SECRET = 'KEE6tLabuVe02ZZb6ZVVHbmkXjXnnB9l'; // <--- 请替换

    if (APP_ID === '你的APP_ID' || APP_ID.length < 5) {
      showToast('代码未配置 APP_ID');
      return null;
    }

    try {
      console.log(`[Direct API] 开始查询: ${barcode}`);
      
      // 2. 原始 API 地址
      const targetUrl = `https://www.mxnzp.com/api/barcode/goods/details?barcode=${barcode}&app_id=${APP_ID}&app_secret=${APP_SECRET}`;
      
      // 3. 【关键】使用 CORS 代理绕过浏览器限制
      // 我们使用 allorigins.win 作为公共代理，它会帮我们转发请求并加上正确的 CORS 头
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      
      // 设置 8 秒超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      // 如果代理返回状态码不是 200
      if (!response.ok) {
        throw new Error(`Proxy Error: ${response.status}`);
      }

      const data = await response.json();
      console.log("[API响应]", data);

      // 4. 处理数据
      if (data.code === 1 && data.data) {
        const goodsName = data.data.goodsName + (data.data.standard ? ` (${data.data.standard})` : '');
        const safePrice = parseFloat(data.data.price) || 0;

        // 更新本地数据
        const product = products.value.find(p => p.barcode === barcode);
        const cartItem = cart.value.find(i => i.barcode === barcode);

        if (product) {
            product.name = goodsName;
            product.price = safePrice;
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
        // API 返回了内容，但 code 不是 1（比如 0），说明没查到或参数不对
        console.warn('API 报错:', data.msg);
        showToast(`查询失败: ${data.msg || '无数据'}`);
        return null;
      }

    } catch (e) {
      console.error('查询异常:', e);
      
      // 【关键】把具体的错误原因弹出来，方便手机调试
      if (e.name === 'AbortError') {
        showToast('请求超时，请检查网络');
      } else if (e.message.includes('Failed to fetch')) {
        showToast('网络连接失败 (CORS或断网)');
      } else {
        showToast(`出错: ${e.message}`);
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