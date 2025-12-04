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

  // 核心修改：使用 Supabase Edge Function
  const enrichProductInfo = async (barcode) => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-product', {
        body: { barcode }
      })

      // 1. 错误处理
      if (error) {
        console.error('云函数调用报错:', error);
        showToast('网络查询失败，请手动编辑商品');
        return null;
      }

      if (data && !data.found) {
        const reason = data.reason || data.error || '未知原因';
        console.warn('云端查询未找到商品:', reason);
        return null;
      }

      // 2. 成功获取数据
      if (data && data.found) {
        // 组合名称和规格，例如 "可口可乐 (330ml)"
        const goodsName = data.name + (data.spec ? ` (${data.spec})` : '')
        const safePrice = parseFloat(data.price) || 0

        // 查找本地商品
        const product = products.value.find(p => p.barcode === barcode);
        
        // ★★★ 关键修正 1：先判断是否需要更新云端（在修改本地数据之前！）
        let shouldUpdateCloud = false;
        if (product) {
          if (product.name.includes('正在查询') || product.name.includes('未命名')) {
            shouldUpdateCloud = true; // 标记：这个商品是新的，需要存到云端
          }
        }

        // 3. 更新本地商品库
        if (shouldUpdateCloud && product) {
          product.name = goodsName; // ★★★ 关键修正 2：使用带规格的完整名称
          product.price = safePrice;
        }

        // 4. 更新购物车 (确保收银员马上看到变化)
        const cartItem = cart.value.find(i => i.barcode === barcode);
        if (cartItem) {
          if (cartItem.name.includes('正在查询') || cartItem.name.includes('未命名')) {
            cartItem.name = goodsName;
            cartItem.price = safePrice;
          }
        }

        // 5. 同步到 Supabase
        // 使用刚才记录的 flag 来判断，而不是再次检查 product.name (因为它已经被改掉了)
        if (shouldUpdateCloud) {
          const productData = {
            barcode: barcode,
            name: goodsName, // 使用完整名称
            price: safePrice,
            stock: product?.stock || 999,
          };
          
          // 复制其他可能存在的字段
          if (product) {
            Object.keys(product).forEach(key => {
              if (!productData.hasOwnProperty(key)) {
                productData[key] = product[key];
              }
            });
          }

          supabase.from('products').upsert(productData, { onConflict: 'barcode' }).then(({ error }) => {
            if (error) console.error('云端更新商品失败', error);
          });
        }

        return goodsName; // 返回商品名称给前端
      }
      
    } catch (e) {
      console.error('云函数调用失败:', e);
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