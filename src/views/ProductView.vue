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
  const scanBoxRef = ref(null);
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
  
  // Torch state
  const isTorchOn = ref(false);
  
  // Query state
  const isQuerying = ref(false);
  
  // Torch control
  const toggleTorch = async () => {
    if (!videoTrack.value) return;
    try {
      const capabilities = videoTrack.value.getCapabilities();
      if (!capabilities.torch) {
        showToast({ type: 'fail', message: '不支持手电筒' });
        return;
      }
      await videoTrack.value.applyConstraints({ advanced: [{ torch: !isTorchOn.value }] });
      isTorchOn.value = !isTorchOn.value;
    } catch (err) {
      showToast({ type: 'fail', message: '手电筒控制失败' });
    }
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
    showToast({ type: 'warning', message: '未建档，请录入' });
  };
  
  // --- 触发商品信息查询 ---
  const triggerSearch = async (code) => {
    // Set querying state
    isQuerying.value = true;
  
    try {
      const name = await store.enrichProductInfo(code);
      if (name) {
        showToast({ type: 'success', message: `已识别：${name}` });
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
  
  // --- 扫码成功处理 ---
  const handleScanSuccess = async (code) => {
    barcode.value = code;
    const product = store.findProduct(code);
  
    // 触发震动反馈（如果支持）
    if (navigator.vibrate) {
      navigator.vibrate(50); // 50ms 震动
    }
  
    // Apply success visual feedback to scan box
    if (scanBoxRef.value) {
      // Temporarily remove any previous error state
      scanBoxRef.value.classList.remove('scan-error-shake');
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
  
  
  
  // --- 编辑相关 ---
  const editingItem = ref(null);
  const editForm = ref({ barcode: '', name: '', price: 0, stock: 0 });
  const showEditDialog = ref(false);
  
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
    showToast({ type: 'success', message: '已更新' });
  };
  
  // --- 删除商品 (带确认弹窗) ---
  const confirmDelete = (itemBarcode) => {
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
    // 更新编辑表单中的库存值
    if (editForm.value && editForm.value.barcode === item.barcode) {
      editForm.value.stock = item.stock + 10;
    }
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
      <div v-if="isScanning" class="fixed inset-0 z-50">
        <!-- 摄像头预览 -->
        <video ref="videoEl" class="w-full h-full object-cover object-center" muted playsinline style="background: #000;"></video>
  
        <!-- 遮罩层 -->
        <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center pointer-events-none">
          <!-- 扫描框容器 -->
          <div ref="scanBoxRef" class="relative" style="width: 70vw; height: 70vw; max-width: 260px; max-height: 260px;">
            <!-- 扫描框四个角 -->
            <div class="absolute top-0 left-0 w-5 h-5 border-l-4 border-t-4 border-white" style="width: 20px; height: 20px;"></div>
            <div class="absolute top-0 right-0 w-5 h-5 border-r-4 border-t-4 border-white" style="width: 20px; height: 20px;"></div>
            <div class="absolute bottom-0 left-0 w-5 h-5 border-l-4 border-b-4 border-white" style="width: 20px; height: 20px;"></div>
            <div class="absolute bottom-0 right-0 w-5 h-5 border-r-4 border-b-4 border-white" style="width: 20px; height: 20px;"></div>
  
            <!-- 扫描线动画 (替换了旧的动画类，使用新的 scan-line) -->
            <div v-if="!isQuerying" class="scan-line"></div>
  
            <!-- 查询中状态 -->
            <div v-else class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <van-loading size="24" color="#07C160" />
              <span class="text-white text-sm mt-2">正在查询...</span>
            </div>
          </div>
  
          <!-- 手电筒按钮 -->
          <div class="absolute bottom-20 w-full flex justify-center">
            <van-button
              type="default"
              round
              size="small"
              class="bg-white/30 backdrop-blur-sm text-white border border-white/20"
              @click="toggleTorch"
            >
              <i class="van-icon van-icon-light-o"></i>
              补光
            </van-button>
          </div>
        </div>
  
        <!-- 顶部操作栏 -->
        <div class="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div class="flex justify-between items-center">
            <span class="text-white font-bold">扫描条形码</span>
            <van-button type="default" size="small" class="bg-white/30 backdrop-blur-sm text-white border border-white/20" @click="stopCamera">关闭</van-button>
          </div>
        </div>
  
        <!-- 错误提示 -->
        <div v-if="scanError" class="absolute top-1/4 w-full px-4">
          <div class="bg-red-500 text-white text-sm p-3 rounded-lg text-center mx-auto" style="max-width: 300px;">
            {{ scanError }}
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
  
          <!-- 侧滑编辑组件 -->
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
              <van-button square type="primary" text="编辑" class="h-full" @click="openEditDialog(item)" />
            </template>
          </van-swipe-cell>
        </div>
      </div>
    </div>
    
    <!-- 编辑商品模态窗 -->
    <van-dialog v-model:show="showEditDialog" title="编辑商品" show-cancel-button @confirm="saveEdit">
      <div class="p-4 space-y-3">
        <van-field v-model="editForm.barcode" label="条码" readonly />
        <van-field v-model="editForm.name" label="名称" />
        <van-field v-model="editForm.price" label="价格" type="number" />
        <van-field v-model="editForm.stock" label="库存" type="number" />
        
        <!-- 补货功能 -->
        <div class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-600">快速补货</span>
            <van-button size="mini" type="primary" plain @click="quickRestock(editForm)">+10</van-button>
          </div>
        </div>
      </div>
      <template #footer>
        <van-button size="small" @click="confirmDelete(editingItem.barcode)" style="float: left; margin-left: 10px; background-color: #f44336; color: white;">删除</van-button>
        <van-button size="small" @click="showEditDialog = false">取消</van-button>
        <van-button size="small" type="primary" @click="saveEdit">保存</van-button>
      </template>
    </van-dialog>
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
  
  /* 编辑对话框样式 */
  :deep(.van-dialog__footer) {
    display: flex;
    justify-content: space-between;
    padding: 0 16px 16px;
  }
  </style>