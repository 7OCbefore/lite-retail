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
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    if (videoEl.value) {
      videoEl.value.srcObject = stream;
      videoEl.value.play();
      isScanning.value = true;
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
  } catch (e) {}
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

// --- 业务逻辑 ---
const handleScanSuccess = (code) => {
  const product = store.findProduct(code);
  
  if (!product) {
    // 如果未找到商品，则创建一个默认商品并添加到商品库和购物车
    const newItem = {
      barcode: code,
      name: `未命名商品 (${code})`,
      price: 0, // 默认价格为0
      stock: 999 // 默认库存
    };
    
    // 添加到商品库
    store.addProduct(newItem);
    
    // 添加到购物车
    store.cart.unshift({ ...newItem, qty: 1 });
    beep();
    
    showToast({
      message: `已添加未识别商品: ${code}`,
      position: 'bottom',
      duration: 2000
    });
    
    isScanning.value = false;
    setTimeout(() => isScanning.value = true, 3000);
    return;
  }

  beep();

  const existing = store.cart.find(item => item.barcode === code);
  if (existing) {
    existing.qty++;
  } else {
    store.cart.unshift({ ...product, qty: 1 });
  }
  
  showToast({
    message: `+1 ${product.name}`,
    position: 'bottom',
    duration: 800
  });

  isScanning.value = false;
  setTimeout(() => isScanning.value = true, 1000);
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
    <van-nav-bar
      title="收银台"
      left-text="返回"
      left-arrow
      @click-left="router.push('/')"
      @click-right="store.cart = []"
    >
      <template #right>
        <span class="text-red-500">清空</span>
      </template>
    </van-nav-bar>

    <!-- 2. 扫描区域 -->
    <div class="relative bg-black h-56 flex-shrink-0 overflow-hidden">
      <video ref="videoEl" class="w-full h-full object-cover opacity-80" muted playsinline></video>
      
      <div v-if="isScanning" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-64 h-32 border-2 border-green-400 rounded-lg relative bg-white/10 backdrop-blur-[2px]">
          <div class="absolute w-full h-0.5 bg-red-500 animate-[scan_2s_infinite]"></div>
        </div>
      </div>

      <div class="absolute bottom-4 w-full flex justify-center z-20">
        <van-button 
          v-if="!isScanning" 
          type="primary" 
          round 
          icon="scan" 
          @click="startCamera"
        >
          启动摄像头
        </van-button>
        <van-button 
          v-else 
          type="default" 
          round 
          size="small" 
          class="!bg-white/80 !border-none !backdrop-blur"
          @click="stopCamera"
        >
          停止扫描
        </van-button>
      </div>
      
      <div v-if="scanError" class="absolute top-0 w-full bg-red-500 text-white text-xs p-2 text-center">{{ scanError }}</div>
    </div>

    <!-- 3. 购物车列表 (Vant Card) -->
    <div class="flex-1 overflow-y-auto p-2 pb-20 space-y-2">
      <van-empty v-if="store.cart.length === 0" description="请扫描商品" />

      <van-card
        v-for="item in store.cart"
        :key="item.barcode"
        :price="item.price.toFixed(2)"
        :title="item.name"
        :desc="item.barcode"
        thumb="[https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg](https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg)"
      >
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

    <!-- 4. Vant 提交订单栏 -->
    <van-submit-bar
      :price="totalPriceInCents"
      button-text="收款"
      @submit="handleCheckout"
    />

    <!-- 编辑商品对话框 -->
    <van-dialog
      v-model:show="showEditDialog"
      title="编辑商品"
      show-cancel-button
      @confirm="saveEdit"
    >
      <div class="p-4 space-y-3">
        <van-field
          v-model="editForm.barcode"
          label="条形码"
          readonly
        />
        <van-field
          v-model="editForm.name"
          label="商品名称"
          placeholder="请输入商品名称"
        />
        <van-field
          v-model="editForm.price"
          label="价格"
          type="number"
          placeholder="请输入价格"
        />
        <van-field
          v-model="editForm.stock"
          label="库存"
          type="number"
          placeholder="请输入库存"
        />
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
/* 稍微调整一下 Vant Card 的背景，让它更有层次感 */
:deep(.van-card) {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
@keyframes scan {
  0% { top: 10%; opacity: 0; }
  50% { opacity: 1; }
  100% { top: 90%; opacity: 0; }
}
</style>

<!-- TODO
在PosView.vue的收银功能中，在现有的摄像头扫码收银功能基础上，新增一个搜索框功能。该搜索框应支持通过输入商品名称或条形码的后几位数字来查找商品，并将查找到的商品添加到购物车中以完成收款操作。 -->