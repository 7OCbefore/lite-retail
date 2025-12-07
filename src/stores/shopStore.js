import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { supabase } from '../supabase'
import { showToast, showLoadingToast, closeToast } from 'vant'

export const useShopStore = defineStore('shop', () => {
  // 本地持久化缓存
  const products = ref(JSON.parse(localStorage.getItem('my-products')) || [])
  const orders = ref(JSON.parse(localStorage.getItem('my-orders')) || [])
  const cart = ref([])
  const isSyncing = ref(false)

  // 操作队列，用于处理离线操作
  const pendingActions = ref(JSON.parse(localStorage.getItem('pending-actions')) || [])

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

  // 活跃商品（未被软删除的）
  const activeProducts = computed(() => {
    return products.value.filter(p => !p.is_deleted)
  })

  // --- Actions ---

  const initSync = async () => {
    if (isSyncing.value) return
    isSyncing.value = true
    try {
      console.log('正在从 Supabase 下载数据...')
      const { data, error } = await supabase.from('products').select('*')
      
      if (error) throw error

      if (data && data.length > 0) {
        // 以云端数据为准进行合并
        const localMap = new Map(products.value.map(p => [p.barcode, p]))
        data.forEach(remoteItem => {
          // 如果云端数据没有 is_deleted 字段，添加默认值 false
          if (remoteItem.is_deleted === undefined) {
            remoteItem.is_deleted = false
          }
          localMap.set(remoteItem.barcode, remoteItem)
        })
        products.value = Array.from(localMap.values())
        console.log(`同步完成，加载 ${products.value.length} 个商品`)
      }
    } catch (e) {
      console.error('下载同步失败:', e)
    } finally {
      isSyncing.value = false
    }
  }

  // ★★★ 新增：强制将本地数据推送到云端 ★★★
  const syncLocalToCloud = async () => {
    if (products.value.length === 0) return showToast('本地没有数据')
    
    const toast = showLoadingToast({
      message: '正在上传...',
      forbidClick: true,
      duration: 0
    })

    try {
      // 准备数据：确保只上传纯 JSON 对象，包含 is_deleted 字段
      const payload = products.value.map(p => ({
        barcode: p.barcode,
        name: p.name,
        price: p.price,
        stock: p.stock,
        is_deleted: p.is_deleted || false
      }))

      // 使用 upsert 批量上传，遇到 barcode 相同就覆盖
      const { error } = await supabase.from('products').upsert(payload, { onConflict: 'barcode' })
      
      if (error) throw error
      
      closeToast()
      showToast({ type: 'success', message: '同步成功！云端已更新' })
    } catch (e) {
      closeToast()
      console.error('强制同步失败:', e)
      showToast({ type: 'fail', message: '同步失败，请检查网络或权限' })
    }
  }

  // 处理待执行的操作队列
  const processPendingActions = async () => {
    if (pendingActions.value.length === 0) return

    const actionsToProcess = [...pendingActions.value]
    const remainingActions = []

    for (const action of actionsToProcess) {
      try {
        if (action.type === 'DELETE') {
          await supabase.from('products').update({ is_deleted: true }).eq('barcode', action.barcode)
        } else if (action.type === 'ADD') {
          await supabase.from('products').insert([{ ...action.data, is_deleted: false }])
        } else if (action.type === 'UPDATE') {
          const { barcode, ...updateData } = action.data
          await supabase.from('products').update(updateData).eq('barcode', barcode)
        }
        console.log(`成功处理待执行操作: ${action.type} ${action.barcode || ''}`)
      } catch (error) {
        console.error(`处理待执行操作失败:`, error)
        // 操作失败，将其放回队列等待下次重试
        remainingActions.push(action)
      }
    }

    // 更新待执行操作队列
    pendingActions.value = remainingActions
    localStorage.setItem('pending-actions', JSON.stringify(remainingActions))
  }

  // 监听网络状态变化，网络恢复时处理待执行操作
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('网络连接已恢复，处理待执行操作...')
      processPendingActions()
    })
  }

  const addProduct = async (newProduct) => {
    // 确保新商品的 is_deleted 字段设置为 false
    newProduct.is_deleted = newProduct.is_deleted !== undefined ? newProduct.is_deleted : false

    const index = products.value.findIndex(p => p.barcode === newProduct.barcode)
    if (index !== -1) {
      // 如果商品已存在且已被软删除，恢复它
      if (products.value[index].is_deleted) {
        products.value[index] = { ...newProduct, is_deleted: false }
      } else {
        return false // 商品已存在且未被删除
      }
    } else {
      products.value.push(newProduct)
    }
    
    // 将添加操作添加到待执行队列中
    const action = {
      type: 'ADD',
      data: newProduct,
      timestamp: Date.now()
    }
    pendingActions.value.push(action)
    localStorage.setItem('pending-actions', JSON.stringify(pendingActions.value))

    // 异步上传，不阻塞 UI
    supabase.from('products').insert([{ ...newProduct, is_deleted: false }]).then(({ error }) => {
      if (error) {
        console.error('插入商品失败:', error)
        // 如果失败，保留操作在队列中
      } else {
        // 如果云端添加成功，从待执行队列中移除
        const index = pendingActions.value.findIndex(a => a.type === 'ADD' && a.data.barcode === newProduct.barcode && a.timestamp === action.timestamp)
        if (index !== -1) {
          pendingActions.value.splice(index, 1)
          localStorage.setItem('pending-actions', JSON.stringify(pendingActions.value))
        }
      }
    })
    return true
  }

  const updateProduct = async (updated) => {
    const index = products.value.findIndex(p => p.barcode === updated.barcode)
    if (index !== -1) {
      // 保留 is_deleted 状态
      const isDeleted = products.value[index].is_deleted
      products.value[index] = { ...products.value[index], ...updated, is_deleted: isDeleted }
      
      const cartItem = cart.value.find(i => i.barcode === updated.barcode)
      if (cartItem) {
        cartItem.name = updated.name
        cartItem.price = updated.price
      }

      // 将更新操作添加到待执行队列中
      const action = {
        type: 'UPDATE',
        data: { ...updated, is_deleted: isDeleted },
        timestamp: Date.now()
      }
      pendingActions.value.push(action)
      localStorage.setItem('pending-actions', JSON.stringify(pendingActions.value))

      const { barcode, ...rest } = updated
      supabase.from('products').update({ ...rest, is_deleted: isDeleted }).eq('barcode', barcode).then(({ error }) => {
        if (error) {
          console.error('更新失败:', error)
          // 如果失败，保留操作在队列中
        } else {
          // 如果云端更新成功，从待执行队列中移除
          const actionIndex = pendingActions.value.findIndex(a => a.type === 'UPDATE' && a.data.barcode === updated.barcode && a.timestamp === action.timestamp)
          if (actionIndex !== -1) {
            pendingActions.value.splice(actionIndex, 1)
            localStorage.setItem('pending-actions', JSON.stringify(pendingActions.value))
          }
        }
      }).catch(err => console.error('更新失败:', err))
    }
  }

  const removeProduct = async (barcode) => {
    // 找到要删除的商品并将其 is_deleted 标记为 true
    const productIndex = products.value.findIndex(p => p.barcode === barcode)
    if (productIndex !== -1) {
      products.value[productIndex].is_deleted = true
    }

    // 将删除操作添加到待执行队列中
    const action = {
      type: 'DELETE',
      barcode: barcode,
      timestamp: Date.now()
    }
    pendingActions.value.push(action)
    localStorage.setItem('pending-actions', JSON.stringify(pendingActions.value))

    // 尝试立即同步到云端
    try {
      await supabase.from('products').update({ is_deleted: true }).eq('barcode', barcode)
      // 如果云端删除成功，从待执行队列中移除
      const index = pendingActions.value.findIndex(a => a.type === 'DELETE' && a.barcode === barcode)
      if (index !== -1) {
        pendingActions.value.splice(index, 1)
        localStorage.setItem('pending-actions', JSON.stringify(pendingActions.value))
      }
    } catch (error) {
      console.error('删除操作同步到云端失败:', error)
      // 如果失败，保留操作在队列中，等待下次同步
    }
  }

  const restockProduct = async (barcode, amount) => {
    const product = products.value.find(p => p.barcode === barcode && !p.is_deleted)
    if (product) {
      product.stock += Number(amount)
      supabase.from('products').update({ stock: product.stock }).eq('barcode', barcode).catch(console.error)
    }
  }

  // ★★★ 优化：API 查询与更新逻辑 ★★★
  const enrichProductInfo = async (barcode) => {
    if (!barcode) return null;

    try {
      showToast('云端查询中...');
      
      // 1. 调 API
      const { data, error } = await supabase.functions.invoke('fetch-product', {
        body: { barcode: barcode }
      });

      if (error) throw error;

      if (data && data.found) {
        const fullName = data.name + (data.spec ? ` (${data.spec})` : '');
        const price = parseFloat(data.price) || 0;

        // 2. 更新本地 Store (这是为了让用户立刻看到效果)
        const product = products.value.find(p => p.barcode === barcode && !p.is_deleted);
        const cartItem = cart.value.find(i => i.barcode === barcode);

        if (product) {
          product.name = fullName;
          product.price = price;
        }
        if (cartItem) {
          cartItem.name = fullName;
          cartItem.price = price;
        }

        // 3. ★ 显式更新云端 ★
        // 这里不用 upsert，而是尝试直接 update，因为我们在 addProduct 里已经插入了占位符
        // 如果 addProduct 的插入还在路上，update 可能会失败（找不到行），所以我们加一个重试逻辑
        
        console.log('正在修复云端数据:', fullName);
        
        // 尝试更新
        const { error: updateErr, data: updatedRows } = await supabase
          .from('products')
          .update({ name: fullName, price: price })
          .eq('barcode', barcode)
          .select(); // select() 很重要，它能告诉我们到底更新了几行

        // 如果没有行被更新 (updatedRows 为空)，说明占位符还没插进去，或者被删了
        // 这时候我们再执行 upsert 作为兜底
        if (!updatedRows || updatedRows.length === 0) {
            console.warn('Update 未命中，转为 Upsert...');
            await supabase.from('products').upsert({
                barcode, name: fullName, price, stock: product ? product.stock : 999, is_deleted: false
            }, { onConflict: 'barcode' });
        } else if (updateErr) {
            console.error('更新失败 (Update):', updateErr);
        }

        return fullName;
      } else {
        return null;
      }
    } catch (e) {
      console.error('API错误:', e);
      return null;
    }
  }

  // ... checkout 等其他代码保持不变 ...
  const checkout = async () => {
    if (cart.value.length === 0) return false
    const newOrder = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      items: [...cart.value],
      total: Number(cartTotal.value)
    }
    cart.value.forEach(item => {
      const p = products.value.find(p => p.barcode === item.barcode && !p.is_deleted)
      if (p) p.stock -= item.qty
    })
    orders.value.unshift(newOrder)
    cart.value = []
    
    // 异步更新，不阻塞收银
    try {
        await supabase.from('orders').insert([newOrder])
        // 顺便把库存也同步了
        newOrder.items.forEach(item => {
             const p = products.value.find(p => p.barcode === item.barcode && !p.is_deleted)
             if(p) supabase.from('products').update({stock: p.stock}).eq('barcode', item.barcode).then()
        })
    } catch(e) { console.error(e) }

    return true
  }

  const findProduct = (barcode) => products.value.find(p => p.barcode === barcode && !p.is_deleted)

  watch(products, (v) => localStorage.setItem('my-products', JSON.stringify(v)), { deep: true })
  watch(orders, (v) => localStorage.setItem('my-orders', JSON.stringify(v)), { deep: true })
  watch(pendingActions, (v) => localStorage.setItem('pending-actions', JSON.stringify(v)), { deep: true })

  return {
    products, cart, orders, todaySales, todayOrderCount, cartTotal, activeProducts,
    initSync, syncLocalToCloud, // 导出新函数
    addProduct, updateProduct, removeProduct, restockProduct,
    checkout, findProduct, enrichProductInfo
  }
})

