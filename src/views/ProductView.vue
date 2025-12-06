<script setup>
import { ref, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useShopStore } from '../stores/shopStore';
import { showToast, showDialog } from 'vant';

const router = useRouter();
const store = useShopStore();

// --- 表单数据 ---
const barcode = ref('');
const name = ref('');
const price = ref('');
const stock = ref('10');
const searchText = ref('');

// --- 摄像头扫描相关 ---
const videoEl = ref(null);
const isScanning = ref(false);
const scanError = ref('');
const videoTrack = ref(null);

// --- 摄像头逻辑 ---
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

    // Make sure UI is updated first
    isScanning.value = true;

    // Wait a tick to ensure the video element is rendered
    await new Promise(resolve => setTimeout(resolve, 100));

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoEl.value) {
      videoEl.value.srcObject = stream;
      // Wait for the video to be loaded before starting detection
      videoEl.value.onloadedmetadata = () => {
        videoEl.value.play();
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) videoTrack.value = tracks[0];
        detectBarcode();
      };
    } else {
      // If the video element is not ready yet, try again after a short delay
      setTimeout(() => {
        if (videoEl.value) {
          videoEl.value.srcObject = stream;
          videoEl.value.onloadedmetadata = () => {
            videoEl.value.play();
            const tracks = stream.getVideoTracks();
            if (tracks.length > 0) videoTrack.value = tracks[0];
            detectBarcode();
          };
        }
      }, 500);
    }
  } catch (err) {
    scanError.value = '无法启动摄像头';
    showToast({ type: 'fail', message: '摄像头启动失败' });
    isScanning.value = false;
  }
};

const stopCamera = () => {
  if (videoEl.value && videoEl.value.srcObject) {
    const stream = videoEl.value.srcObject;
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
    }
    videoEl.value.srcObject = null;
  }
  isScanning.value = false;
  videoTrack.value = null;
};

// --- 条码检测逻辑 ---
const detectBarcode = async () => {
  if (!isScanning.value || !videoEl.value) return;
  if (!('BarcodeDetector' in window)) {
    scanError.value = '不支持扫码';
    showToast({ type: 'fail', message: '设备不支持条码检测' });
    stopCamera();
    return;
  }
  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
    const barcodes = await detector.detect(videoEl.value);
    if (barcodes.length > 0) {
      handleScanSuccess(barcodes[0].rawValue);
    }
  } catch (e) {
    console.error('条码检测错误:', e);
  }
  if (isScanning.value) {
    requestAnimationFrame(detectBarcode);
  }
};

// --- 音效函数 ---
const beep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1500;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (error) {
    console.log("Audio context not supported or error:", error);
  }
};

// --- 触发商品信息查询 ---
const triggerSearch = (code) => {
  return store.enrichProductInfo(code).then((name) => {
    if (name) {
      showToast({ type: 'success', message: `已识别：${name}` });
    } else {
      // 查询失败，更名为"未找到"
      const fallback = '未找到商品 (点击编辑)';
      const p = store.products.find(i => i.barcode === code);
      if (p && (p.name.includes('查询中') || p.name.includes('未找到'))) p.name = '未找到商品';

      const c = store.cart.find(i => i.barcode === code);
      if (c && (c.name.includes('查询中') || c.name.includes('未找到'))) c.name = fallback;
    }
  });
};

// --- 扫码成功处理 ---
const handleScanSuccess = async (code) => {
  barcode.value = code;
  const product = store.findProduct(code);

  // 1. 新商品
  if (!product) {
    const newItem = {
      barcode: code,
      name: `查询中... (${code.slice(-4)})`,
      price: 0,
      stock: 999
    };
    store.addProduct(newItem);

    // 添加到购物车（如果需要的话）
    store.cart.unshift({ ...newItem, qty: 1 });
    beep();
    triggerSearch(code); // 触发查询

    showToast({ type: 'success', message: `扫码成功: ${code}` });
    // 短暂延迟后再停止摄像头以提供更好的用户体验
    isScanning.value = false;
    setTimeout(() => isScanning.value = true, 3000);
    return;
  }

  // 2. 已存在但信息不全（上次查询失败了）
  if (product.name.includes('查询中') || product.name.includes('未找到')) {
    const inCart = store.cart.find(i => i.barcode === code);
    if (!inCart) store.cart.unshift({ ...product, qty: 1 });
    else inCart.qty++;

    showToast('再次尝试查询...');
    triggerSearch(code); // 再次尝试
    beep();

    isScanning.value = false;
    setTimeout(() => isScanning.value = true, 2000);
    return;
  }

  // 3. 正常商品 - 如果需要将商品添加到购物车
  const existing = store.cart.find(item => item.barcode === code);
  if (existing) existing.qty++;
  else store.cart.unshift({ ...product, qty: 1 });

  beep();
  showToast(`+1 ${product.name}`);

  // Stop camera after successful scan and restart after delay
  isScanning.value = false;
  setTimeout(() => isScanning.value = true, 1000);
};

// --- 提交新商品 ---
// Vant 的 form 组件会自动处理验证，只有验证通过才会触发 onSubmit
const onSubmit = (values) => {
  const success = store.addProduct({
    barcode: values.barcode,
    name: values.name,
    price: Number(values.price),
    stock: Number(values.stock)
  });

  if (success) {
    showToast({ type: 'success', message: '录入成功' });
    // 清空表单
    barcode.value = '';
    name.value = '';
    price.value = '';
    stock.value = '10';
  } else {
    showToast({ type: 'fail', message: '条码已存在' });
  }
};

// --- 删除商品 (带确认弹窗) ---
const handleDelete = (itemBarcode) => {
  showDialog({
    title: '确认删除?',
    message: '删除后无法恢复，确定要删除这个商品吗？',
    showCancelButton: true,
  }).then((action) => {
    if (action === 'confirm') {
      store.removeProduct(itemBarcode);
      showToast('已删除');
    }
  });
};

// --- 快速补货 ---
const quickRestock = (item) => {
  store.restockProduct(item.barcode, 10);
  showToast(`已补货: ${item.name} +10`);
};

// --- 搜索过滤 ---
const filteredProducts = computed(() => {
  if (!searchText.value) return store.products;
  return store.products.filter(p =>
    p.name.includes(searchText.value) || p.barcode.includes(searchText.value)
  );
});

// 停止摄像头当组件卸载时
onUnmounted(() => {
  stopCamera();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-10">
    <!-- 1. 顶部导航 -->
    <van-nav-bar
      title="商品库管理"
      left-text="返回"
      left-arrow
      fixed
      placeholder
      @click-left="router.push('/')"
    />

    <!-- 扫码摄像头弹窗 -->
    <div v-if="isScanning" class="fixed inset-0 bg-black z-50">
      <div class="flex flex-col h-full">
        <div class="flex justify-between items-center p-4 bg-gray-800 text-white z-10">
          <span>扫描条形码</span>
          <van-button type="default" size="small" @click="stopCamera">关闭</van-button>
        </div>

        <div class="relative flex-1">
          <video ref="videoEl" class="w-full h-full object-cover object-center" muted playsinline style="background: #000;"></video>
          <div class="absolute inset-0 pointer-events-none border-2 border-green-500/50 m-10 rounded"></div>
          <div v-if="scanError" class="absolute top-4 w-full bg-red-500 text-white text-xs p-2 text-center z-20">
            {{ scanError }}
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 录入新商品区域 (折叠面板风格) -->
    <div class="m-3 bg-white rounded-xl overflow-hidden shadow-sm" :class="isScanning ? 'hidden' : ''">
      <div class="p-3 bg-primary/5 text-primary font-bold text-sm">
        📝 录入新商品
      </div>

      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <!-- 条码输入：带扫码按钮 -->
          <van-field
            v-model="barcode"
            name="barcode"
            label="条形码"
            placeholder="扫描或输入"
            :rules="[{ required: true, message: '请填写条码' }]"
          >
            <template #button>
              <van-button size="small" type="primary" plain @click.prevent="startCamera">
                扫码
              </van-button>
            </template>
          </van-field>

          <van-field
            v-model="name"
            name="name"
            label="商品名"
            placeholder="例如：可口可乐"
            :rules="[{ required: true, message: '请填写名称' }]"
          />

          <div class="grid grid-cols-2">
            <van-field
              v-model="price"
              name="price"
              label="价格"
              type="number"
              placeholder="0.00"
              :rules="[{ required: true, message: '必填' }]"
            />
            <van-field
              v-model="stock"
              name="stock"
              label="库存"
              type="digit"
            />
          </div>
        </van-cell-group>

        <div class="p-4">
          <van-button round block type="primary" native-type="submit">
            确认添加
          </van-button>
        </div>
      </van-form>
    </div>

    <!-- 3. 库存列表区域 -->
    <div class="mt-6">
      <van-sticky :offset-top="46">
        <van-search v-model="searchText" placeholder="搜索商品名称或条码..." shape="round" background="#f9fafb" />
      </van-sticky>

      <div class="px-2 space-y-2 mt-2">
        <van-empty v-if="filteredProducts.length === 0" description="暂无商品" />

        <!-- 侧滑删除组件 -->
        <van-swipe-cell 
          v-for="item in filteredProducts" 
          :key="item.barcode" 
          class="bg-white rounded-lg overflow-hidden shadow-sm"
        >
          <van-cell 
            :title="item.name" 
            :label="item.barcode" 
            center
          >
            <!-- 自定义右侧内容 -->
            <template #value>
              <div class="flex flex-col items-end gap-1">
                <span class="text-primary font-bold text-lg">¥{{ item.price }}</span>
                <van-tag :type="item.stock < 10 ? 'danger' : 'success'">
                  库存: {{ item.stock }}
                </van-tag>
              </div>
            </template>
          </van-cell>

          <!-- 右侧滑动出来的按钮 -->
          <template #right>
            <div class="h-full flex">
              <van-button square type="primary" text="+10 补货" class="h-full" @click="quickRestock(item)" />
              <van-button square type="danger" text="删除" class="h-full" @click="handleDelete(item.barcode)" />
            </div>
          </template>
        </van-swipe-cell>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 修复 SwipeCell 圆角显示问题 */
:deep(.van-swipe-cell__right) {
  display: flex;
}

/* 确保视频元素正确显示 */
:deep(video) {
  width: 100% !important;
  height: 100% !important;
  background: #000;
}
</style>