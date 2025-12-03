<script setup>
import { ref, computed } from 'vue';
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

// --- 模拟扫码 (测试用) ---
const scanMock = () => {
  barcode.value = '69' + Math.floor(Math.random() * 10000000000);
  showToast('模拟扫码成功');
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

    <!-- 2. 录入新商品区域 (折叠面板风格) -->
    <div class="m-3 bg-white rounded-xl overflow-hidden shadow-sm">
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
              <van-button size="small" type="primary" plain @click.prevent="scanMock">
                模拟扫码
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
</style>