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
      supabase.from('products').update(rest).eq('barcode', barcode).then(() => { })
    }
  }
  const removeProduct = async (barcode) => {
    products.value = products.value.filter(p => p.barcode !== barcode)
    supabase.from('products').delete().eq('barcode', barcode).then(() => { })
  }
  const restockProduct = async (barcode, amount) => {
    const product = products.value.find(p => p.barcode === barcode)
    if (product) {
      product.stock += Number(amount)
      supabase.from('products').update({ stock: product.stock }).eq('barcode', barcode).then(() => { })
    }
  }

  const enrichProductInfo = async (barcode) => {
    // 1. 简单的防抖或空值检查
    if (!barcode) return null;

    try {
      showToast('正在云端查询...');

      // 2. 调用刚才部署的 Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('fetch-product', {
        body: { barcode: barcode }
      });

      if (error) throw error; // 如果网络层面出错

      // 3. 处理业务逻辑
      if (data && data.found) {
        // 拼接商品名和规格
        const fullName = data.name + (data.spec ? ` (${data.spec})` : '');
        const price = parseFloat(data.price) || 0;

        // 4. 自动更新当前 store 中的数据
        const product = products.value.find(p => p.barcode === barcode);
        const cartItem = cart.value.find(i => i.barcode === barcode);

        // 如果库存里有这个占位符，更新它
        if (product) {
          product.name = fullName;
          product.price = price;
          // 顺便同步保存到数据库
          supabase.from('products').upsert({
            barcode, name: fullName, price: price, stock: product.stock
          }).catch(() => { });
        }

        // 如果购物车里有，也更新
        if (cartItem) {
          cartItem.name = fullName;
          cartItem.price = price;
        }

        return fullName; // 返回名字告诉调用者成功了
      } else {
        // 没查到
        console.warn('API查询结果:', data.msg);
        return null;
      }

    } catch (e) {
      console.error('云函数调用失败:', e);
      showToast('查询失败，请手动录入');
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
        supabase.from('products').update({ stock: p.stock }).eq('barcode', item.barcode).then(() => { })
      }
    })
    orders.value.unshift(newOrder)
    cart.value = []
    supabase.from('orders').insert([newOrder]).then(() => { })
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