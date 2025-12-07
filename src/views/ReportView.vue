<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useShopStore } from '../stores/shopStore';
import * as echarts from 'echarts';
import IOSNavBar from '../components/IOSNavBar.vue';

const router = useRouter();
const store = useShopStore();
const chartRef = ref(null); // 图表容器

// --- 1. 数据统计逻辑 ---
// 获取最近 7 天的日期数组
const getLast7Days = () => {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })); // "12/3"
  }
  return dates;
};

// 计算最近 7 天每天的销售额
const chartData = computed(() => {
  const days = getLast7Days();
  const values = new Array(7).fill(0);

  store.orders.forEach(order => {
    const orderDate = new Date(order.date);
    // 简单的日期匹配逻辑
    const diffTime = Math.abs(new Date() - orderDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) {
      // 倒序填充 (今天在最后)
      const index = 6 - diffDays; 
      if (index >= 0) values[index] += order.total;
    }
  });
  
  return { days, values };
});

// --- 2. 初始化图表 ---
onMounted(() => {
  if (chartRef.value) {
    const myChart = echarts.init(chartRef.value);
    
    const option = {
      title: { 
        text: '近七日销售趋势', 
        left: 'center', 
        textStyle: { 
          fontSize: 14, 
          color: '#666',
          fontWeight: 'normal'
        } 
      },
      tooltip: { trigger: 'axis' },
      grid: { left: '10%', right: '10%', bottom: '15%', top: '20%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: chartData.value.days,
        axisLine: { show: false }, // 隐藏坐标轴线
        axisTick: { show: false }, // 隐藏坐标轴刻度
        axisLabel: { color: '#666' } // 坐标轴文字颜色
      },
      yAxis: { 
        type: 'value',
        splitLine: { lineStyle: { type: 'solid', color: '#f0f0f0' } }, // 更简洁的网格线
        axisLine: { show: false }, // 隐藏坐标轴线
        axisTick: { show: false }, // 隐藏坐标轴刻度
        axisLabel: { color: '#666' } // 坐标轴文字颜色
      },
      series: [
        {
          data: chartData.value.values,
          type: 'line',
          smooth: true, // 平滑曲线
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#007AFF' }, // iOS 蓝色
          lineStyle: {
            width: 3
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 122, 255, 0.2)' },
              { offset: 1, color: 'rgba(0, 122, 255, 0.05)' }
            ])
          }
        }
      ]
    };
    
    myChart.setOption(option);
    
    // 窗口大小改变时自动重绘
    window.addEventListener('resize', () => myChart.resize());
  }
});
</script>

<template>
  <div class="min-h-screen bg-ios-gray-100 pb-10">
    <!-- iOS 风格导航栏 -->
    <IOSNavBar 
      title="销售报表" 
      left-text="返回" 
      :left-arrow="true" 
      @left-click="() => router.push('/')"
    />

    <div class="p-4 space-y-4">
      <!-- iOS 风格概览卡片 -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p class="text-xs text-ios-gray-label">累计订单</p>
          <p class="text-xl font-bold text-gray-900">{{ store.orders.length }} <span class="text-xs font-normal">笔</span></p>
        </div>
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p class="text-xs text-ios-gray-label">总销售额</p>
          <p class="text-xl font-bold text-primary">
            ¥{{ store.orders.reduce((sum, o) => sum + o.total, 0).toFixed(2) }}
          </p>
        </div>
      </div>

      <!-- iOS 风格图表区域 -->
      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div ref="chartRef" style="width: 100%; height: 300px;"></div>
      </div>

      <!-- 详细流水 - iOS 风格分组列表 -->
      <div>
        <h3 class="text-sm font-semibold text-ios-gray-label mb-3 ml-1">最近交易记录</h3>
        <van-empty v-if="store.orders.length === 0" description="暂无销售记录" />
        
        <div class="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200">
          <div 
            v-for="(order, index) in store.orders.slice(0, 20)" 
            :key="order.id"
            class="p-4 border-b border-gray-100 last:border-0"
          >
            <!-- 订单标题 -->
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium text-gray-900">{{ new Date(order.date).toLocaleDateString() }}</span>
              <span class="font-semibold text-primary">+{{ order.total.toFixed(2) }}</span>
            </div>
            
            <!-- 订单明细 -->
            <div class="space-y-1">
              <div 
                v-for="item in order.items" 
                :key="item.barcode" 
                class="flex justify-between pl-4 text-sm py-1 border-l-2 border-gray-200"
              >
                <span class="text-gray-700">{{ item.name }} x {{ item.qty }}</span>
                <span class="text-gray-500">¥{{ (item.price * item.qty).toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <p v-if="store.orders.length > 20" class="text-center text-xs text-ios-gray-label mt-4">仅显示最近 20 笔记录</p>
      </div>
    </div>
  </div>
</template>