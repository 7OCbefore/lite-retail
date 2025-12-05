import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { supabase } from '../supabase'
import { showToast } from 'vant'

export const useShopStore = defineStore('shop', () => {
  // 保持之前的状态定义不变...
  const products = ref(JSON.parse(localStorage.getItem('my-products')) || [])
  const orders = ref(JSON.parse(localStorage.getItem('my-orders')) || [])
  const cart = ref([])
  const isSyncing = ref(false)

  // ... Getters 保持不变 ...
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
  const initSync = async () => {
    if (isSyncing.value) return
    isSyncing.value = true
    try {
      console.log('正在同步...')
      const { data, error } = await supabase.from('products').select('*')
      if (error) throw error
      if (data) {
        // 使用 Map 优化合并逻辑
        const localMap = new Map(products.value.map(p => [p.barcode, p]))
        data.forEach(remoteItem => {
          localMap.set(remoteItem.barcode, remoteItem)
        })
        products.value = Array.from(localMap.values())
      }
    } catch (e) {
      console.error('同步失败:', e)
    } finally {
      isSyncing.value = false
    }
  }

  const addProduct = async (newProduct) => {
    const index = products.value.findIndex(p => p.barcode === newProduct.barcode)
    if (index !== -1) return false
    products.value.push(newProduct)
    // 异步插入，哪怕占位符也先存进去
    supabase.from('products').insert([newProduct]).catch(err => console.error('添加失败:', err))
    return true
  }

  const updateProduct = async (updated) => {
    const index = products.value.findIndex(p => p.barcode === updated.barcode)
    if (index !== -1) {
      products.value[index] = { ...products.value[index], ...updated }
      // 更新购物车显示
      const cartItem = cart.value.find(i => i.barcode === updated.barcode)
      if (cartItem) {
        cartItem.name = updated.name
        cartItem.price = updated.price
      }
      const { barcode, ...rest } = updated
      supabase.from('products').update(rest).eq('barcode', barcode).catch(err => console.error('更新失败:', err))
    }
  }

  const removeProduct = async (barcode) => {
    products.value = products.value.filter(p => p.barcode !== barcode)
    supabase.from('products').delete().eq('barcode', barcode).catch(err => console.error('删除失败:', err))
  }

  const restockProduct = async (barcode, amount) => {
    const product = products.value.find(p => p.barcode === barcode)
    if (product) {
      product.stock += Number(amount)
      supabase.from('products').update({ stock: product.stock }).eq('barcode', barcode).catch(console.error)
    }
  }

  // ★★★ 核心修改：修复数据不更新的问题 ★★★
  const enrichProductInfo = async (barcode) => {
    if (!barcode) return null;

    try {
      showToast('正在云端查询...');
      
      const { data, error } = await supabase.functions.invoke('fetch-product', {
        body: { barcode: barcode }
      });

      if (error) throw error;

      if (data && data.found) {
        const fullName = data.name + (data.spec ? ` (${data.spec})` : '');
        const price = parseFloat(data.price) || 0;

        // 1. 更新本地 Store
        const product = products.value.find(p => p.barcode === barcode);
        const cartItem = cart.value.find(i => i.barcode === barcode);

        if (product) {
          product.name = fullName;
          product.price = price;
          
          // 2. 更新云端数据库
          // 关键点：添加 { onConflict: 'barcode' }
          // 这告诉 Supabase：如果不冲突就插入，如果 barcode 冲突了，就更新这一行
          const { error: upsertErr } = await supabase.from('products').upsert({
            barcode, 
            name: fullName, 
            price: price, 
            stock: product.stock // 保持原有库存
          }, { onConflict: 'barcode' }) // <--- 必须加这个！
          
          if (upsertErr) {
            console.error('更新占位数据失败 (upsert):', upsertErr)
            showToast('云端同步失败，但本地已更新')
          } else {
            console.log('商品信息已修复:', fullName)
          }
        }

        if (cartItem) {
          cartItem.name = fullName;
          cartItem.price = price;
        }

        return fullName;
      } else {
        return null;
      }

    } catch (e) {
      console.error('云函数错误:', e);
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
    
    // 更新库存
    cart.value.forEach(item => {
      const p = products.value.find(p => p.barcode === item.barcode)
      if (p) {
        p.stock -= item.qty
        supabase.from('products').update({ stock: p.stock }).eq('barcode', item.barcode).catch(console.error)
      }
    })

    orders.value.unshift(newOrder)
    cart.value = []
    
    supabase.from('orders').insert([newOrder]).catch(console.error)
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