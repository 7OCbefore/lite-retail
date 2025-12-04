<script setup>
import { ref, onUnmounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useShopStore } from '../stores/shopStore';
// 引入 Vant 的轻提示组件
import { showToast, showSuccessToast, showFailToast } from 'vant';

const router = useRouter();
const store = useShopStore();

const videoEl = ref(null);
const isScanning = ref(false);
const scanError = ref('');
const isTorchOn = ref(false);
const videoTrack = ref(null);

// 搜索相关
const searchKeyword = ref('');
const searchResults = computed(() => {
  if (!searchKeyword.value.trim()) return [];

  const query = searchKeyword.value.trim();

  return store.products.filter(item => {
    // 匹配名称
    const nameMatch = item.name.toLowerCase().includes(query.toLowerCase());
    // 匹配条码（使用 includes 容错性更好）
    const barcodeMatch = item.barcode.includes(query);

    return nameMatch || barcodeMatch;
  });
});

// 编辑相关
const editingItem = ref(null);
const editForm = ref({
  barcode: '',
  name: '',
  price: 0,
  stock: 0
});
const showEditDialog = ref(false);

// --- 摄像头逻辑 (保持不变) ---
const startCamera = async () => {
  scanError.value = '';
  try {
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        advanced: [{ focusMode: 'continuous' }]
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoEl.value) {
      videoEl.value.srcObject = stream;
      videoEl.value.play();
      isScanning.value = true;

      // 获取视频轨道用于手电筒控制
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        videoTrack.value = tracks[0];
      }

      detectBarcode();
    }
  } catch (err) {
    scanError.value = '无法启动摄像头，请检查权限';
    showFailToast('摄像头启动失败'); // 使用 Toast 提示
  }
};

const stopCamera = () => {
  if (videoEl.value && videoEl.value.srcObject) {
    videoEl.value.srcObject.getTracks().forEach(t => t.stop());
    isScanning.value = false;
    isTorchOn.value = false;
    videoTrack.value = null;
  }
};

// 新增手电筒控制功能
const toggleTorch = async () => {
  if (!videoTrack.value) return;

  try {
    const capabilities = videoTrack.value.getCapabilities();
    if (!capabilities.torch) {
      showFailToast('当前设备不支持手电筒功能');
      return;
    }

    await videoTrack.value.applyConstraints({
      advanced: [{ torch: !isTorchOn.value }]
    });

    isTorchOn.value = !isTorchOn.value;
  } catch (err) {
    showFailToast('无法切换手电筒');
  }
};

// 点击对焦功能
const handleVideoClick = async (event) => {
  if (!videoEl.value || !videoTrack.value) return;

  // 创建对焦动画元素
  const focusEl = document.createElement('div');
  focusEl.className = 'focus-animation';
  focusEl.style.left = `${event.clientX - 30}px`;
  focusEl.style.top = `${event.clientY - 30}px`;

  const scannerArea = document.querySelector('.scanner-overlay');
  if (scannerArea) {
    scannerArea.appendChild(focusEl);

    // 移除动画元素
    setTimeout(() => {
      if (focusEl.parentNode) {
        focusEl.parentNode.removeChild(focusEl);
      }
    }, 1000);
  }

  // 尝试触发重新对焦
  try {
    await videoTrack.value.applyConstraints({
      advanced: [{ focusMode: 'continuous' }]
    });
  } catch (err) {
    // 对焦失败无需特殊处理
  }
};

const detectBarcode = async () => {
  if (!isScanning.value || !videoEl.value) return;
  if (!('BarcodeDetector' in window)) {
    scanError.value = '当前设备不支持原生扫码';
    return;
  }
  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
    const barcodes = await detector.detect(videoEl.value);
    if (barcodes.length > 0) handleScanSuccess(barcodes[0].rawValue);
  } catch (e) { }
  requestAnimationFrame(detectBarcode);
};

// 监听商品变化，同步更新购物车中的商品信息
watch(() => store.products, () => {
  syncCartWithProducts();
}, { deep: true });

// 同步购物车与商品库中的信息
const syncCartWithProducts = () => {
  store.cart.forEach(cartItem => {
    const product = store.findProduct(cartItem.barcode);
    if (product) {
      // 更新购物车中的商品信息（除了数量）
      cartItem.name = product.name;
      cartItem.price = product.price;
      cartItem.stock = product.stock;
    }
  });
};

// --- 业务逻辑：扫码成功 ---
const handleScanSuccess = async (code) => {
  const product = store.findProduct(code);

  // 情况 A: 这是一个新商品 (本地没有)
  if (!product) {
    // 1. 先创建一个“临时工”占位，让收银员能看到东西进来了
    const newItem = {
      barcode: code,
      name: `正在查询... (${code.slice(-4)})`, // 名字暂时显示“正在查询”
      price: 0,
      stock: 999
    };

    // 2. 加入本地库和购物车
    store.addProduct(newItem);
    store.cart.unshift({ ...newItem, qty: 1 });
    beep(); // 滴一声

    // 3. 【新增步骤】去网上查一下它是谁
    store.enrichProductInfo(code).then((realName) => {
      if (realName) {
        showSuccessToast(`已识别：${realName}`);
      } else {
        showToast('未找到网络信息，请手动编辑');

        // --- 新增修复代码 ---
        // 1. 找到购物车里那个还在"正在查询"的商品
        const cartItem = store.cart.find(item => item.barcode === code);
        if (cartItem && cartItem.name.includes('正在查询')) {
          cartItem.name = '未找到商品 (点击编辑)'; // 或者直接显示 '新商品'
        }

        // 2. 同时更新商品库里的记录，防止下次扫同一个码还是"正在查询"
        const product = store.products.find(p => p.barcode === code);
        if (product && product.name.includes('正在查询')) {
          product.name = '未找到商品';
        }
      }
    });

    // 4. 防止重复扫码的冷却时间
    isScanning.value = false;
    setTimeout(() => isScanning.value = true, 3000); // 新商品多停一会，给3秒
    return;
  }

  // 情况 B: 这是一个老商品 (本地有)
  beep(); // 滴一声

  const existing = store.cart.find(item => item.barcode === code);
  if (existing) {
    existing.qty++; // 购物车里数量+1
  } else {
    store.cart.unshift({ ...product, qty: 1 }); // 加进购物车
  }

  showToast({
    message: `+1 ${product.name}`,
    position: 'bottom',
    duration: 800
  });

  isScanning.value = false;
  setTimeout(() => isScanning.value = true, 1000);
};

// 从搜索结果添加商品到购物车
const addItemFromSearch = (product) => {
  const existing = store.cart.find(item => item.barcode === product.barcode);
  if (existing) {
    existing.qty++;
  } else {
    store.cart.unshift({ ...product, qty: 1 });
  }

  showToast({
    message: `已添加：${product.name}`,
    position: 'bottom',
    duration: 800
  });

  // 清空搜索关键字，关闭搜索结果列表
  searchKeyword.value = '';
};

// 结算逻辑 (对接 Vant SubmitBar)
const handleCheckout = () => {
  if (store.cart.length === 0) {
    showToast('购物车是空的');
    return;
  }

  const success = store.checkout();
  if (success) {
    showSuccessToast('收款成功');
  }
};

// 声音 (保持不变)
const beep = () => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 1500;
  gain.gain.value = 0.1;
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
};

// 编辑商品
const openEditDialog = (item) => {
  editForm.value = {
    barcode: item.barcode,
    name: item.name,
    price: item.price,
    stock: item.stock
  };
  editingItem.value = item;
  showEditDialog.value = true;
};

const saveEdit = () => {
  if (!editForm.value.barcode) return;

  // 更新商品库
  store.updateProduct({
    barcode: editForm.value.barcode,
    name: editForm.value.name,
    price: Number(editForm.value.price),
    stock: Number(editForm.value.stock)
  });

  showEditDialog.value = false;
  showToast('商品信息已更新');
};

// 计算总价 (注意：Vant SubmitBar 接收的是“分”，所以要 * 100)
const totalPriceInCents = computed(() => {
  return store.cart.reduce((sum, item) => sum + item.price * item.qty, 0) * 100;
});

onUnmounted(() => stopCamera());
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <!-- 1. Vant 导航栏 -->
    <van-nav-bar title="收银台" left-text="返回" left-arrow @click-left="router.push('/')" @click-right="store.cart = []">
      <template #right>
        <span class="text-red-500">清空</span>
      </template>
    </van-nav-bar>

    <!-- 2. 搜索框 -->
    <div class="p-2 bg-white">
      <van-search v-model="searchKeyword" placeholder="输入商品名称或条码" shape="round" background="transparent" />

      <!-- 搜索结果列表 -->
      <div v-if="searchKeyword" class="absolute left-0 right-0 bg-white z-10 shadow-lg max-h-60 overflow-y-auto"
        style="top: 110px">
        <van-empty v-if="searchResults.length === 0" description="未找到商品" />

        <van-cell v-for="product in searchResults" :key="product.barcode" clickable @click="addItemFromSearch(product)">
          <div class="flex justify-between items-center">
            <div>
              <div class="font-medium">{{ product.name }}</div>
              <div class="text-gray-500 text-sm">{{ product.barcode }}</div>
            </div>
            <div class="text-red-500 font-bold">¥{{ product.price.toFixed(2) }}</div>
          </div>
        </van-cell>
      </div>
    </div>

    <!-- 3. 扫描区域 -->
    <div class="relative bg-black h-56 flex-shrink-0 overflow-hidden">
      <video ref="videoEl" class="w-full h-full object-cover" muted playsinline @click="handleVideoClick"></video>

      <!-- 扫描遮罩层 -->
      <div v-if="isScanning" class="scanner-overlay absolute inset-0 pointer-events-none">
        <!-- 四周半透明遮罩 -->
        <div class="scanner-mask"></div>

        <!-- 中间透明扫描区域 -->
        <div class="scanner-box">
          <!-- 扫描框四角装饰 -->
          <div class="scanner-corner top-left"></div>
          <div class="scanner-corner top-right"></div>
          <div class="scanner-corner bottom-left"></div>
          <div class="scanner-corner bottom-right"></div>

          <!-- 扫描线动画 -->
          <div class="scanner-line"></div>
        </div>
      </div>

      <div class="absolute bottom-4 w-full flex justify-center z-20 gap-4">
        <van-button v-if="!isScanning" type="primary" round icon="scan" @click="startCamera">
          启动摄像头
        </van-button>
        <van-button v-else type="default" round size="small" class="!bg-white/80 !border-none !backdrop-blur"
          @click="stopCamera">
          停止扫描
        </van-button>

        <!-- 手电筒按钮 -->
        <van-button v-if="isScanning" type="default" round size="small" class="!bg-white/80 !border-none !backdrop-blur"
          :class="{ 'torch-on': isTorchOn }" @click="toggleTorch">
          <template #icon>
            <svg viewBox="0 0 1024 1024" width="1em" height="1em" class="torch-icon">
              <path v-if="!isTorchOn"
                d="M384 320h256v64H384zM448 256h128v64H448zM384 640h256v64H384zM384 480h256v64H384z"
                fill="currentColor" />
              <path v-else
                d="M448 128h128v64H448zM384 256h256v64H384zM384 384h256v64H384zM384 512h256v64H384zM384 640h256v64H384z"
                fill="currentColor" />
            </svg>
          </template>
          手电筒
        </van-button>
      </div>

      <div v-if="scanError" class="absolute top-0 w-full bg-red-500 text-white text-xs p-2 text-center">{{ scanError }}
      </div>
    </div>

    <!-- 4. 购物车列表 (Vant Card) -->
    <div class="flex-1 overflow-y-auto p-2 pb-20 space-y-2">
      <van-empty v-if="store.cart.length === 0" description="请扫描商品" />

      <van-card v-for="item in store.cart" :key="item.barcode" :price="item.price.toFixed(2)" :title="item.name"
        :desc="item.barcode"
        thumb="[https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg](https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg)">
        <!-- 使用 Vant 的 Stepper 步进器控制数量 -->
        <template #num>
          <van-stepper v-model="item.qty" theme="round" button-size="22" disable-input />
        </template>
        <!-- 编辑按钮 -->
        <template #footer>
          <van-button size="small" type="default" @click="openEditDialog(item)">编辑</van-button>
        </template>
      </van-card>
    </div>

    <!-- 5. Vant 提交订单栏 -->
    <van-submit-bar :price="totalPriceInCents" button-text="收款" @submit="handleCheckout" />

    <!-- 编辑商品对话框 -->
    <van-dialog v-model:show="showEditDialog" title="编辑商品" show-cancel-button @confirm="saveEdit">
      <div class="p-4 space-y-3">
        <van-field v-model="editForm.barcode" label="条形码" readonly />
        <van-field v-model="editForm.name" label="商品名称" placeholder="请输入商品名称" />
        <van-field v-model="editForm.price" label="价格" type="number" placeholder="请输入价格" />
        <van-field v-model="editForm.stock" label="库存" type="number" placeholder="请输入库存" />
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
/* 稍微调整一下 Vant Card 的背景，让它更有层次感 */
:deep(.van-card) {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

/* 扫描区域样式 */
.scanner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.scanner-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  box-shadow: inset 0 0 0 9999px rgba(0, 0, 0, 0.5);
}

.scanner-box {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 240px;
  height: 240px;
  border-radius: 8px;
  box-sizing: border-box;
}

.scanner-corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: #00ff00;
  border-style: solid;
}

.top-left {
  top: 0;
  left: 0;
  border-width: 3px 0 0 3px;
}

.top-right {
  top: 0;
  right: 0;
  border-width: 3px 3px 0 0;
}

.bottom-left {
  bottom: 0;
  left: 0;
  border-width: 0 0 3px 3px;
}

.bottom-right {
  bottom: 0;
  right: 0;
  border-width: 0 3px 3px 0;
}

.scanner-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(to bottom, rgba(0, 255, 0, 0) 0%, rgba(0, 255, 0, 0.8) 50%, rgba(0, 255, 0, 0) 100%);
  animation: scanning 2s ease-in-out infinite;
  box-shadow: 0 0 8px rgba(0, 255, 0, 0.6);
}

@keyframes scanning {
  0% {
    top: 0;
    opacity: 0;
  }

  10% {
    opacity: 1;
  }

  90% {
    opacity: 1;
  }

  100% {
    top: 100%;
    opacity: 0;
  }
}

.focus-animation {
  position: absolute;
  width: 60px;
  height: 60px;
  border: 2px solid #00ff00;
  border-radius: 50%;
  animation: focus 1s ease-out forwards;
  pointer-events: none;
}

@keyframes focus {
  0% {
    transform: scale(1.2);
    opacity: 1;
  }

  100% {
    transform: scale(0.8);
    opacity: 0;
  }
}

.torch-on {
  color: #FFD700;
  background-color: #fff5cc !important;
}

.torch-icon {
  width: 1em;
  height: 1em;
}
</style>
