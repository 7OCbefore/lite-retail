<template>
  <div class="min-h-screen bg-gray-50 pb-10">
    <van-nav-bar
      title="会员管理"
      left-text="返回"
      left-arrow
      fixed
      placeholder
      @click-left="router.push('/')"
    />

    <div class="p-4">
      <h2 class="text-lg font-bold mb-4">会员管理功能</h2>
      <p class="text-gray-600">此功能正在开发中...</p>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();
</script>