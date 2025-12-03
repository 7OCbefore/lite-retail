<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useShopStore } from '../stores/shopStore';
import * as echarts from 'echarts';

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
      title: { text: '近七日销售趋势', left: 'center', textStyle: { fontSize: 14, color: '#666' } },
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: chartData.value.days,
        axisLine: { lineStyle: { color: '#ccc' } }
      },
      yAxis: { 
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed' } }
      },
      series: [
        {
          data: chartData.value.values,
          type: 'line',
          smooth: true, // 平滑曲线
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: '#006C50' }, // 主题色
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 108, 80, 0.5)' },
              { offset: 1, color: 'rgba(0, 108, 80, 0.05)' }
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
  <div class="min-h-screen bg-gray-50 pb-10">
    <van-nav-bar
      title="销售报表"
      left-text="返回"
      left-arrow
      fixed
      placeholder
      @click-left="router.push('/')"
    />

    <div class="p-4 space-y-4">
      <!-- 概览卡片 -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-white p-4 rounded-xl shadow-sm">
          <p class="text-xs text-gray-500">累计订单</p>
          <p class="text-xl font-bold text-gray-800">{{ store.orders.length }} <span class="text-xs font-normal">笔</span></p>
        </div>
        <div class="bg-white p-4 rounded-xl shadow-sm">
          <p class="text-xs text-gray-500">总销售额</p>
          <!-- 这里简单计算所有订单总和 -->
          <p class="text-xl font-bold text-primary">
            ¥{{ store.orders.reduce((sum, o) => sum + o.total, 0).toFixed(2) }}
          </p>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="bg-white p-4 rounded-xl shadow-sm">
        <div ref="chartRef" style="width: 100%; height: 300px;"></div>
      </div>

      <!-- 详细流水 -->
      <div>
        <h3 class="text-sm font-bold text-gray-500 mb-2 ml-1">最近交易记录</h3>
        <van-empty v-if="store.orders.length === 0" description="暂无销售记录" />
        
        <van-collapse v-else v-model="activeNames" accordion>
          <van-collapse-item 
            v-for="order in store.orders.slice(0, 20)" 
            :key="order.id" 
            :name="order.id"
          >
            <!-- 标题插槽：左边时间，右边金额 -->
            <template #title>
              <div class="flex justify-between w-full pr-2">
                <span class="font-mono text-gray-600">{{ new Date(order.date).toLocaleString() }}</span>
                <span class="font-bold text-primary">+{{ order.total.toFixed(2) }}</span>
              </div>
            </template>
            
            <!-- 展开内容：商品明细 -->
            <div class="text-sm">
              <div v-for="item in order.items" :key="item.barcode" class="flex justify-between py-1 border-b border-gray-50 last:border-none">
                <span>{{ item.name }} x {{ item.qty }}</span>
                <span class="text-gray-500">¥{{ (item.price * item.qty).toFixed(2) }}</span>
              </div>
            </div>
          </van-collapse-item>
        </van-collapse>
        <p v-if="store.orders.length > 20" class="text-center text-xs text-gray-400 mt-4">仅显示最近 20 笔记录</p>
      </div>
    </div>
  </div>
</template>