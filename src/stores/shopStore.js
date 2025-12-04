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

  const updateProduct = async (updatedProduct) => {
    // 查找商品索引
    const index = products.value.findIndex(p => p.barcode === updatedProduct.barcode)
    if (index === -1) return false

    // 更新本地 (合并现有属性)
    products.value[index] = { ...products.value[index], ...updatedProduct }

    // 云端更新（排除条形码字段，因为条形码是主键）
    const { barcode, ...updateData } = updatedProduct;
    supabase.from('products').update(updateData).eq('barcode', barcode).then(({ error }) => {
      if (error) console.error('云端更新商品失败', error)
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

  // --- 新增：去网络上查询商品信息 ---
  const enrichProductInfo = async (barcode) => {
    // 1. 申请到的 ID 和 密钥
    const appId = 'ulpumjnnphx8kmar'; 
    const appSecret = 'KEE6tLabuVe02ZZb6ZVVHbmkXjXnnB9l';

    // 2. RollTool 的 API 地址
    const url = `https://www.mxnzp.com/api/barcode/goods/details?barcode=${barcode}&app_id=${appId}&app_secret=${appSecret}`;

    try {
      // 3. 发起请求
      const response = await fetch(url);
      const resJson = await response.json();

      // 4. code 为 1 表示成功
      if (resJson.code === 1 && resJson.data) {
        const data = resJson.data;
        
        // 5. 如果查到了名字，且本地的名字还是占位符，就更新它
        // 先找商品库
        const product = products.value.find(p => p.barcode === barcode);
        if (product) {
          // 只有商品名称是占位符时才更新（防止覆盖用户手动编辑）
          if (product.name.includes('正在查询') || product.name.includes('未命名')) {
            product.name = data.goodsName; // 更新名字
            product.price = parseFloat(data.price) || 0; // 更新价格
          }
          // product.standard = data.standard; // 想存规格，可以在这里加
        }

        // 再找购物车 (因为界面上显示的是购物车里的数据)
        const cartItem = cart.value.find(i => i.barcode === barcode);
        if (cartItem) {
          // 购物车项名称检查同理
          if (cartItem.name.includes('正在查询') || cartItem.name.includes('未命名')) {
            cartItem.name = data.goodsName;
            cartItem.price = parseFloat(data.price) || 0;
          }
        }

        // 6. 顺手把新数据存到 Supabase (如果配置了云端)
        // 使用 upsert 确保商品存在（存在则更新，不存在则插入）
        // 只有当商品名称是占位符时才更新云端（与本地逻辑一致）
        const shouldUpdateCloud = product && (product.name.includes('正在查询') || product.name.includes('未命名'));

        if (shouldUpdateCloud) {
          // 准备更新数据，保留现有字段，只更新名称和价格
          const updateData = {
            barcode: barcode,
            name: data.goodsName,
            price: parseFloat(data.price) || 0,
            // 使用现有商品的库存和其他字段
            stock: product.stock,
          };
          // 复制其他可能存在的字段（如category等）
          Object.keys(product).forEach(key => {
            if (!updateData.hasOwnProperty(key)) {
              updateData[key] = product[key];
            }
          });
          supabase.from('products').upsert(updateData, { onConflict: 'barcode' }).then(({ error }) => {
            if (error) console.error('云端更新商品失败', error);
          });
        } else if (!product) {
          // 商品不存在（理论上不会发生，但保底处理）
          const insertData = {
            barcode: barcode,
            name: data.goodsName,
            price: parseFloat(data.price) || 0,
            stock: 999,
          };
          supabase.from('products').upsert(insertData, { onConflict: 'barcode' }).then(({ error }) => {
            if (error) console.error('云端插入商品失败', error);
          });
        }
        // 如果商品存在但名称不是占位符（用户已编辑），则不更新云端

        return data.goodsName;
      }
    } catch (error) {
      console.error('查不到这个商品:', error);
    }
    return null; // 没查到
  };

  // --- 持久化 (保持 LocalStorage 作为兜底) ---
  watch(products, (v) => localStorage.setItem('my-products', JSON.stringify(v)), { deep: true })
  watch(orders, (v) => localStorage.setItem('my-orders', JSON.stringify(v)), { deep: true })

  return { 
    products, cart, orders, isSyncing,
    todaySales, todayOrderCount, cartTotal,
    initSync, // 导出这个新方法
    addProduct, updateProduct, restockProduct, removeProduct, findProduct, checkout, 
    enrichProductInfo
  }
})
