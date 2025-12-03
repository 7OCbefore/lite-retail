<script setup>
import { useRouter } from 'vue-router';
import { useShopStore } from '../stores/shopStore';
import { showToast } from 'vant';

const router = useRouter();
const store = useShopStore();

const goPos = () => {
  router.push('/pos');
};

const handleFeatureNotReady = () => {
  showToast('功能开发中...');
};
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 1. 顶部标题栏 -->
    <van-nav-bar title="老张的便利店" :border="false" class="!bg-transparent" />

    <div class="p-4 space-y-6">
      <!-- 2. 数据概览卡片 (自定义样式) -->
      <div class="bg-gradient-to-br from-primary to-emerald-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <!-- 装饰背景圆圈 -->
        <div class="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        
        <div class="relative z-10 flex justify-between items-end">
          <div>
            <p class="text-emerald-100 text-sm mb-1">今日销售额</p>
            <h2 class="text-4xl font-bold">
              <span class="text-2xl align-top">¥</span>{{ store.todaySales }}
            </h2>
          </div>
          <div class="text-right">
            <p class="text-emerald-100 text-xs mb-1">订单数</p>
            <p class="text-xl font-bold">{{ store.todayOrderCount }}</p>
          </div>
        </div>
      </div>

      <!-- 3. 主操作区：收银台 -->
      <div 
        @click="goPos"
        class="bg-white rounded-2xl p-6 shadow-sm active:scale-[0.98] transition-all cursor-pointer border border-gray-100 flex items-center justify-between group"
      >
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-3xl group-active:scale-110 transition-transform">
            🛒
          </div>
          <div>
            <h3 class="text-xl font-bold text-gray-800">收银开单</h3>
            <p class="text-gray-400 text-sm mt-1">点击开始扫码收银</p>
          </div>
        </div>
        <van-icon name="arrow" class="text-gray-300" />
      </div>

      <!-- 4. 常用功能宫格 (Grid) -->
      <div>
        <h3 class="text-sm font-bold text-gray-500 mb-3 ml-1">常用管理</h3>
        <van-grid :column-num="3" :gutter="10" clickable>
          <!-- 商品管理 -->
          <van-grid-item 
            icon="goods-collect-o" 
            text="商品库" 
            to="/products"
            class="rounded-xl overflow-hidden"
          />
          
          <!-- 快速入库 (目前还没有独立页面，先提示) -->
          <van-grid-item 
            icon="logistics" 
            text="入库登记" 
            @click="handleFeatureNotReady" 
          />
          
          <!-- 销售报表 (占位) -->
          <van-grid-item 
            icon="chart-trending-o" 
            text="销售报表" 
            badge="New"
            to="/report"
          />
          
          <!-- 店铺设置 (占位) -->
          <van-grid-item 
            icon="shop-o" 
            text="店铺信息" 
            @click="handleFeatureNotReady" 
          />
          
          <!-- 会员管理 (占位) -->
          <van-grid-item 
            icon="friends-o" 
            text="会员管理" 
            @click="handleFeatureNotReady" 
          />
          
          <!-- 更多 -->
          <van-grid-item 
            icon="apps-o" 
            text="更多功能" 
            @click="handleFeatureNotReady" 
          />
        </van-grid>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 让 Vant Grid 的圆角更好看 */
:deep(.van-grid-item__content) {
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
</style>
