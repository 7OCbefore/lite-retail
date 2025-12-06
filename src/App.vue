<script setup>
import { onMounted } from 'vue';
import { useShopStore } from './stores/shopStore';
import './styles/scan-animation.css';

const store = useShopStore();

onMounted(() => {
  // App 启动时，悄悄同步数据
  console.log('正在从 Supabase 拉取数据...');
  store.initSync();
});
</script>

<template>
  <router-view></router-view>
</template>
