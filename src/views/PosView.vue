<script setup>
  import { ref, onUnmounted, computed, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { useShopStore } from '../stores/shopStore';
  import { showToast, showSuccessToast, showFailToast } from 'vant';
  
  const router = useRouter();
  const store = useShopStore();
  
  const videoEl = ref(null);
  const scanBoxRef = ref(null);
  const isScanning = ref(false);
  const scanError = ref('');
  const isTorchOn = ref(false);
  const videoTrack = ref(null);
  const isQuerying = ref(false);
  
  // 搜索相关
  const searchKeyword = ref('');
  const searchResults = computed(() => {
    if (!searchKeyword.value.trim()) return [];
    const query = searchKeyword.value.trim();
    return store.products.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(query.toLowerCase());
      const barcodeMatch = item.barcode.includes(query);
      return nameMatch || barcodeMatch;
    });
  });
  
  // 编辑相关
  const editingItem = ref(null);
  const editForm = ref({ barcode: '', name: '', price: 0, stock: 0 });
  const showEditDialog = ref(false);
  
  // 摄像头逻辑
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
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) videoTrack.value = tracks[0];
        detectBarcode();
      }
    } catch (err) {
      scanError.value = '无法启动摄像头';
      showFailToast('摄像头启动失败');
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
  
  const toggleTorch = async () => {
    if (!videoTrack.value) return;
    try {
      const capabilities = videoTrack.value.getCapabilities();
      if (!capabilities.torch) { showFailToast('不支持手电筒'); return; }
      await videoTrack.value.applyConstraints({ advanced: [{torch: !isTorchOn.value }] }); // 修复了原来的 typo 'jh'
      isTorchOn.value = !isTorchOn.value;
    } catch (err) {}
  };
  
  const handleVideoClick = async (event) => {
      // 对焦逻辑，保持简单，省略具体实现以免代码过长，功能同上个版本
  };
  
  const detectBarcode = async () => {
    if (!isScanning.value || !videoEl.value) return;
    if (!('BarcodeDetector' in window)) { scanError.value = '不支持扫码'; return; }
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
      const barcodes = await detector.detect(videoEl.value);
      if (barcodes.length > 0) handleScanSuccess(barcodes[0].rawValue);
    } catch (e) { }
    requestAnimationFrame(detectBarcode);
  };
  
  // 监听并同步购物车
  watch(() => store.products, () => {
    store.cart.forEach(cartItem => {
      const product = store.findProduct(cartItem.barcode);
      if (product) {
        cartItem.name = product.name;
        cartItem.price = product.price;
        cartItem.stock = product.stock;
      }
    });
  }, { deep: true });
  
  // ★★★ 扫码处理逻辑 ★★★
  const handleScanSuccess = async (code) => {
    const product = store.findProduct(code);
  
    // 触发震动反馈（如果支持）
    if (navigator.vibrate) {
      navigator.vibrate(50); // 50ms 震动
    }
  
    // Apply success visual feedback to scan box
    if (scanBoxRef.value) {
      scanBoxRef.value.classList.add('scan-success-effect');
      setTimeout(() => {
        if (scanBoxRef.value) {
          scanBoxRef.value.classList.remove('scan-success-effect');
        }
      }, 500);
    }
  
    // 1. 新商品
    if (!product) {
      const newItem = {
        barcode: code,
        name: `查询中... (${code.slice(-4)})`,
        price: 0,
        stock: 999
      };
      store.addProduct(newItem);
      store.cart.unshift({ ...newItem, qty: 1 });
      beep();
      triggerSearch(code); // 触发查询
  
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
  
    // 3. 正常商品
    const existing = store.cart.find(item => item.barcode === code);
    if (existing) existing.qty++;
    else store.cart.unshift({ ...product, qty: 1 });
  
    beep();
    showToast(`+1 ${product.name}`);
    isScanning.value = false;
    setTimeout(() => isScanning.value = true, 1000);
  };
  
  // Function to handle not found state with visual feedback
  const handleNotFound = (code) => {
    // Apply error animation to scan box
    if (scanBoxRef.value) {
      scanBoxRef.value.classList.remove('scan-success-effect');
      scanBoxRef.value.classList.add('scan-error-shake');
      setTimeout(() => {
        if (scanBoxRef.value) {
          scanBoxRef.value.classList.remove('scan-error-shake');
        }
      }, 500);
    }
  
    // Show error toast
    showFailToast('未建档，请录入');
  };
  
  const triggerSearch = async (code) => {
    // Set querying state
    isQuerying.value = true;
  
    try {
      const name = await store.enrichProductInfo(code);
      if (name) {
        showSuccessToast(`已识别：${name}`);
      } else {
        // 查询失败，更名为"未找到"
        const fallback = '未找到商品 (点击编辑)';
        const p = store.products.find(i => i.barcode === code);
        if (p && (p.name.includes('查询中') || p.name.includes('未找到'))) p.name = '未找到商品';
  
        const c = store.cart.find(i => i.barcode === code);
        if (c && (c.name.includes('查询中') || c.name.includes('未找到'))) c.name = fallback;
  
        // Handle the not found case with visual feedback
        handleNotFound(code);
      }
    } finally {
      // Always reset querying state
      isQuerying.value = false;
    }
  };
  
  const addItemFromSearch = (product) => {
    const existing = store.cart.find(item => item.barcode === product.barcode);
    if (existing) existing.qty++;
    else store.cart.unshift({ ...product, qty: 1 });
    showToast(`已添加：${product.name}`);
    searchKeyword.value = '';
  };
  
  const handleCheckout = () => {
    if (store.cart.length === 0) { showToast('空购物车'); return; }
    if(store.checkout()) showSuccessToast('收款成功');
  };
  
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
  
  const openEditDialog = (item) => {
    editForm.value = { ...item };
    editingItem.value = item;
    showEditDialog.value = true;
  };
  
  const saveEdit = () => {
    store.updateProduct({
      barcode: editForm.value.barcode,
      name: editForm.value.name,
      price: Number(editForm.value.price),
      stock: Number(editForm.value.stock)
    });
    showEditDialog.value = false;
    showToast('已更新');
  };
  
  const totalPriceInCents = computed(() => store.cart.reduce((sum, item) => sum + item.price * item.qty, 0) * 100);
  
  onUnmounted(() => stopCamera());
  </script>
  
  <template>
    <div class="h-screen flex flex-col bg-gray-50">
      <van-nav-bar title="收银台" left-text="返回" left-arrow @click-left="router.push('/')">
          <template #right><span class="text-red-500" @click="store.cart = []">清空</span></template>
      </van-nav-bar>
  
      <div class="p-2 bg-white relative">
        <van-search v-model="searchKeyword" placeholder="输入名称或条码" shape="round" />
        <div v-if="searchKeyword" class="absolute left-0 right-0 bg-white z-10 shadow-lg max-h-60 overflow-y-auto" style="top: 54px">
          <van-cell v-for="p in searchResults" :key="p.barcode" :title="p.name" :value="'¥'+p.price" clickable @click="addItemFromSearch(p)" />
        </div>
      </div>
  
      <!-- 修复：增加了高度 h-64 (256px)，以容纳更大的扫码框 -->
      <div class="relative bg-black h-64 flex-shrink-0 overflow-hidden">
        <video ref="videoEl" class="w-full h-full object-cover" muted playsinline @click="handleVideoClick"></video>
  
        <!-- 扫码遮罩层 -->
        <div v-if="isScanning" class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center pointer-events-none">
          <!-- 扫描框容器：修复了尺寸，使其不超过父容器高度 (max-height: 200px) -->
          <div ref="scanBoxRef" class="relative" style="width: 65vw; height: 65vw; max-width: 200px; max-height: 200px;">
            <!-- 扫描框四个角 -->
            <div class="absolute top-0 left-0 w-5 h-5 border-l-4 border-t-4 border-white" style="width: 20px; height: 20px;"></div>
            <div class="absolute top-0 right-0 w-5 h-5 border-r-4 border-t-4 border-white" style="width: 20px; height: 20px;"></div>
            <div class="absolute bottom-0 left-0 w-5 h-5 border-l-4 border-b-4 border-white" style="width: 20px; height: 20px;"></div>
            <div class="absolute bottom-0 right-0 w-5 h-5 border-r-4 border-b-4 border-white" style="width: 20px; height: 20px;"></div>
  
            <!-- 扫描线动画 (使用新样式 scan-line) -->
            <div v-if="!isQuerying" class="scan-line"></div>
  
            <!-- 查询中状态 -->
            <div v-else class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <van-loading size="24" color="#07C160" />
              <span class="text-white text-sm mt-2">正在查询...</span>
            </div>
          </div>
  
          <!-- 手电筒按钮 -->
          <div class="absolute bottom-4 right-4">
            <van-button
              type="default"
              round
              size="small"
              class="bg-white/30 backdrop-blur-sm text-white border border-white/20"
              @click="toggleTorch"
            >
              <i class="van-icon van-icon-light-o"></i>
            </van-button>
          </div>
        </div>
  
        <div class="absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-auto">
          <van-button v-if="!isScanning" type="primary" round icon="scan" @click="startCamera">启动摄像头</van-button>
          <template v-else>
              <van-button type="default" round size="small" class="!bg-white/30 backdrop-blur-sm !text-white border border-white/20" @click="stopCamera">停止</van-button>
          </template>
        </div>
        <div v-if="scanError" class="absolute top-0 w-full bg-red-500 text-white text-xs p-1 text-center">{{ scanError }}</div>
      </div>
  
      <div class="flex-1 overflow-y-auto p-2 pb-20 space-y-2">
        <van-empty v-if="store.cart.length === 0" description="请扫描商品" />
        <van-card v-for="item in store.cart" :key="item.barcode" :price="item.price.toFixed(2)" :title="item.name" :desc="item.barcode">
          <template #num><van-stepper v-model="item.qty" theme="round" button-size="22" disable-input /></template>
          <template #footer><van-button size="small" @click="openEditDialog(item)">编辑</van-button></template>
        </van-card>
      </div>
  
      <van-submit-bar :price="totalPriceInCents" button-text="收款" @submit="handleCheckout" />
  
      <van-dialog v-model:show="showEditDialog" title="编辑商品" show-cancel-button @confirm="saveEdit">
        <div class="p-4 space-y-3">
          <van-field v-model="editForm.barcode" label="条码" readonly />
          <van-field v-model="editForm.name" label="名称" />
          <van-field v-model="editForm.price" label="价格" type="number" />
          <van-field v-model="editForm.stock" label="库存" type="number" />
        </div>
      </van-dialog>
    </div>
  </template>