<script setup>
import { useRouter } from 'vue-router';
import { useShopStore } from '../stores/shopStore';
import { showToast, showDialog } from 'vant';
import IOSNavBar from '../components/IOSNavBar.vue';

const router = useRouter();
const store = useShopStore();

const goPos = () => {
  router.push('/pos');
};

const handleFeatureNotReady = () => {
  showToast('功能开发中...');
};

// 手动触发同步
const handleSync = () => {
  showDialog({
    title: '同步数据',
    message: '这将把本地所有的商品数据强制推送到云端数据库，解决数据不一致问题。',
    showCancelButton: true,
    confirmButtonText: '立即同步'
  }).then((action) => {
    if (action === 'confirm') {
      store.syncLocalToCloud();
    }
  });
};
</script>

<template>
  <div class="min-h-screen bg-ios-gray-100">
    <!-- iOS 风格导航栏 -->
    <IOSNavBar title="LiteRetail" />

    <div class="p-4 space-y-6">
      <!-- iOS 风格数据概览 - 模仿 Apple Health -->
      <div class="flex space-x-3">
        <!-- 销售额卡片 -->
        <div class="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div class="flex items-center">
            <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mr-3">
              <span class="text-green-600 text-lg">¥</span>
            </div>
            <div>
              <p class="text-xs text-ios-gray-label">销售额</p>
              <p class="text-2xl font-bold text-gray-900">{{ store.todaySales }}</p>
            </div>
          </div>
        </div>
        
        <!-- 订单数卡片 -->
        <div class="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div class="flex items-center">
            <div class="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mr-3">
              <span class="text-orange-600 text-lg">🧾</span>
            </div>
            <div>
              <p class="text-xs text-ios-gray-label">订单数</p>
              <p class="text-2xl font-bold text-gray-900">{{ store.todayOrderCount }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- iOS 风格收银台 - 类似 Wallet 卡片 -->
      <div 
        @click="goPos"
        class="bg-white rounded-2xl p-5 shadow-sm active:bg-gray-50 transition-colors cursor-pointer border border-gray-100"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-2xl mr-4">
              🛒
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">收银开单</h3>
              <p class="text-sm text-ios-gray-label mt-1">点击开始扫码收银</p>
            </div>
          </div>
          <div class="w-6 h-6 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
        </div>
      </div>

      <!-- 常用功能 - 模仿 iOS 快捷指令风格 -->
      <div>
        <h3 class="text-sm font-semibold text-ios-gray-label mb-3 ml-1">常用管理</h3>
        
        <!-- iOS 风格分组列表 -->
        <div class="bg-white rounded-xl mx-1 overflow-hidden shadow-sm border border-gray-100">
          <div 
            @click="router.push('/products')"
            class="flex items-center p-4 border-b border-gray-100 last:border-0 active:bg-gray-50 transition-colors"
          >
            <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mr-3">
              <van-icon name="goods-collect-o" class="text-blue-600" />
            </div>
            <span class="flex-1 text-base text-gray-900">商品库</span>
            <div class="w-5 h-5 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
          </div>
          
          <div 
            @click="handleSync"
            class="flex items-center p-4 border-b border-gray-100 last:border-0 active:bg-gray-50 transition-colors"
          >
            <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mr-3">
              <van-icon name="cloud-upload" class="text-green-600" />
            </div>
            <span class="flex-1 text-base text-gray-900">数据同步</span>
            <div class="w-5 h-5 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
          </div>
          
          <div 
            @click="router.push('/report')"
            class="flex items-center p-4 border-b border-gray-100 last:border-0 active:bg-gray-50 transition-colors"
          >
            <div class="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mr-3">
              <van-icon name="chart-trending-o" class="text-purple-600" />
            </div>
            <span class="flex-1 text-base text-gray-900">销售报表</span>
            <div class="w-5 h-5 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
          </div>
          
          <div 
            @click="handleFeatureNotReady"
            class="flex items-center p-4 border-b border-gray-100 last:border-0 active:bg-gray-50 transition-colors"
          >
            <div class="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center mr-3">
              <van-icon name="shop-o" class="text-yellow-600" />
            </div>
            <span class="flex-1 text-base text-gray-900">店铺信息</span>
            <div class="w-5 h-5 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
          </div>
          
          <div 
            @click="handleFeatureNotReady"
            class="flex items-center p-4 border-b border-gray-100 last:border-0 active:bg-gray-50 transition-colors"
          >
            <div class="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center mr-3">
              <van-icon name="friends-o" class="text-pink-600" />
            </div>
            <span class="flex-1 text-base text-gray-900">会员管理</span>
            <div class="w-5 h-5 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
          </div>
          
          <div 
            @click="handleFeatureNotReady"
            class="flex items-center p-4 active:bg-gray-50 transition-colors"
          >
            <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mr-3">
              <van-icon name="apps-o" class="text-indigo-600" />
            </div>
            <span class="flex-1 text-base text-gray-900">更多功能</span>
            <div class="w-5 h-5 border-r-2 border-b-2 border-gray-400 transform rotate-[-45deg]"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* iOS 风格滚动优化 */
:deep(*) {
  -webkit-overflow-scrolling: touch;
}
</style>