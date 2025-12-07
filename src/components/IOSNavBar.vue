<template>
  <div class="ios-nav-bar">
    <div class="h-12"></div> <!-- 状态栏占位 -->
    <div class="flex items-center h-12 px-4 relative">
      <slot name="left">
        <button v-if="leftText || leftArrow" @click="handleLeftClick" class="text-ios-blue font-semibold text-base flex items-center">
          <van-icon v-if="leftArrow" name="arrow-left" class="mr-1" />
          {{ leftText }}
        </button>
      </slot>
      
      <h1 v-if="title" class="absolute left-1/2 transform -translate-x-1/2 text-lg font-semibold text-gray-900">
        {{ title }}
      </h1>
      
      <slot name="right" class="ml-auto">
        <button v-if="rightText" @click="handleRightClick" class="text-ios-blue font-semibold text-base">
          {{ rightText }}
        </button>
      </slot>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';

const props = defineProps({
  title: String,
  leftText: String,
  rightText: String,
  leftArrow: {
    type: Boolean,
    default: false
  },
  leftAction: Function
});

const router = useRouter();

const handleLeftClick = () => {
  if (props.leftAction) {
    props.leftAction();
  } else if (props.leftArrow) {
    router.go(-1);
  }
};

const handleRightClick = () => {
  // 右侧按钮点击事件可以由父组件处理
};
</script>

<style scoped>
.ios-nav-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.05);
  -webkit-backdrop-filter: blur(20px); /* Safari 兼容 */
}
</style>