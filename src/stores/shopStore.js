import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { supabase } from '../supabase'
import { showToast } from 'vant'

export const useShopStore = defineStore('shop', () => {
  // 本地持久化缓存
  const products = ref(JSON.parse(localStorage.getItem('my-products')) || [])
  const orders = ref(JSON.parse(localStorage.getItem('my-orders')) || [])
  const cart = ref([])
  const isSyncing = ref(false)

  // --- Getters ---
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

  // --- Actions ---

  // ★★★ 修复核心：恢复同步逻辑 ★★★
  const initSync = async () => {
    if (isSyncing.value) return
    isSyncing.value = true
    try {
      console.log('正在从 Supabase 同步商品库...')
      // 查你自己的商品库表 (products)，而不是标准库 (standard_products)
      const { data, error } = await supabase.from('products').select('*')
      
      if (error) throw error

      if (data &&kz.length > 0) {
        // 简单合并策略：以云端数据为优先，补充到本地
        // 1. 创建一个 Map 方便去重
        const localMap = new Map(products.value.map(p => [p.barcode, p]))
        
        // 2. 用云端数据覆盖/添加
        data.forEach(remoteItem => {
          localMap.set(remoteItem.barcode, remoteItem)
        })
        
        // 3. 转回数组
        products.value = Array.from(localMap.values())
        console.log(`同步完成，共加载 ${products.value.length} 个商品`)
      }
    } catch (e) {
      console.error('同步失败 (initSync):', e)
      // 如果是 404 或表不存在，可能是 Supabase 那边还没建表
    } finally {
      isSyncing.value = false
    }
  }

  const addProduct = async (newProduct) => {
    // 本地查重
    const index = products.value.findIndex(p => p.barcode === newProduct.barcode)
    if (index !== -1) return false
    
    // 1. 先更新本地 UI，保证速度
    products.value.push(newProduct)
    
    // 2. 异步上传到 Supabase
    const { error } = await supabase.from('products').insert([newProduct])
    if (error) {
      console.error('上传商品失败 (addProduct):', error)
      showToast('云端同步失败，数据仅保存在本地')
    }
    return true
  }

  const updateProduct = async (updated) => {
    const index = products.value.findIndex(p => p.barcode === updated.barcode)
    if (index !== -1) {
      // 更新本地
      products.value[index] = { ...products.value[index], ...updated }
      
      // 同步更新购物车里的显示（如果存在）
      const cartItem = cart.value.find(i => i.barcode === updated.barcode)
      if (cartItem) {
        cartItem.name = updated.name
        cartItem.price = updated.price
      }

      // 更新云端
      const { barcode, ...rest } = updated
      // 注意：这里我们只更新除 barcode 以外的字段
      const { error } = await supabase.from('products').update(rest).eq('barcode', barcode)
      if (error) {
        console.error('更新商品失败 (updateProduct):', error)
      }
    }
  }

  const removeProduct = async (barcode) => {
    products.value = products.value.filter(p => p.barcode !== barcode)
    const { error } = await supabase.from('products').delete().eq('barcode', barcode)
    if (error) {
        console.error('删除商品失败:', error)
    }
  }

  const restockProduct = async (barcode, amount) => {
    const product = products.value.find(p => p.barcode === barcode)
    if (product) {
      product.stock += Number(amount)
      // 增量更新库存
      const { error } = await supabase.from('products').update({ stock: product.stock }).eq('barcode', barcode)
      if (error) console.error('补货同步失败:', error)
    }
  }

  // 调用云函数查询 (仅当本地没有时)
  const enrichProductInfo = async (barcode) => {
    if (!barcode) return null;

    try {
      showToast('正在云端查询...');
      
      // 直接调用 API (因为你已经去掉了查库步骤)
      const { data, error } = await supabase.functions.invoke('fetch-product', {
        body: { barcode: barcode }
      });

      if (error) throw error;

      if (data && data.found) {
        const fullName = data.name + (data.spec ? ` (${data.spec})` : '');
        const price = parseFloat(data.price) || 0;

        // 更新本地 Store
        const product = products.value.find(p => p.barcode === barcode);
        const cartItem = cart.value.find(i => i.barcode === barcode);

        if (product) {
          product.name = fullName;
          product.price = price;
          
          // ★★★ 关键：查到数据后，写入你自己的 products 表 ★★★
          const { error: upsertErr } = await supabase.from('products').upsert({
            barcode, 
            name: fullName, 
            price: price, 
            stock: product.stock // 保持原有库存
          })
          
          if (upsertErr) {
            console.error('写入数据库失败 (upsert):', upsertErr)
            // 常见原因：RLS 权限未开，或者 barcode 重复冲突
          }
        }

        if (cartItem) {
          cartItem.name = fullName;
          cartItem.price = price;
        }

        return fullName;
      } else {
        console.warn('API查询无果:', data.msg);
        return null;
      }

    } catch (e) {
      console.error('云函数/网络错误:', e);
      showToast('查询失败，请手动录入');
      return null;
    }
  }

  const checkout = async () => {
    if (cart.value.length === 0) return false
    
    const newOrder = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      items: [...cart.value],
      total: Number(cartTotal.value)
    }

    // 1. 扣减本地库存
    cart.value.forEach(item => {
      const p = products.value.find(p => p.barcode === item.barcode)
      if (p) {
        p.stock -= item.qty
        // 异步扣减云端库存
        supabase.from('products').update({ stock: p.stock }).eq('barcode', item.barcode).catch(console.error)
      }
    })

    // 2. 保存订单
    orders.value.unshift(newOrder)
    cart.value = [] // 清空购物车
    
    // 3. 同步订单到云端
    supabase.from('orders').insert([newOrder]).catch(err => {
        console.error('订单上传失败:', err)
        // 可以在这里加个 ToDo: 保存到本地待上传队列
    })
    
    return true
  }

  const findProduct = (barcode) => products.value.find(p => p.barcode === barcode)

  // 监听变化自动保存到 localStorage
  watch(products, (v) => localStorage.setItem('my-products', JSON.stringify(v)), { deep: true })
  watch(orders, (v) => localStorage.setItem('my-orders', JSON.stringify(v)), { deep: true })

  return {
    products, cart, orders, todaySales, todayOrderCount, cartTotal,
    initSync, addProduct, updateProduct, removeProduct, restockProduct,
    checkout, findProduct, enrichProductInfo
  }
})