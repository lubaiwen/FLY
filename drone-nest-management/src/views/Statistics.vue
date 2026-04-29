<template>
  <div class="statistics-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">数据统计</h1>
        <p class="page-subtitle">系统运营数据分析</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" size="small" class="btn-primary" @click="refreshData">
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
      </div>
    </div>
    
    <!-- 图表网格 -->
    <div class="charts-grid">
      <div class="chart-card large">
        <div class="chart-header">
          <h3 class="chart-title">机巢利用率趋势</h3>
          <div class="chart-actions">
            <el-radio-group v-model="utilizationRange" size="small" @change="handleRangeChange">
              <el-radio-button label="day">日</el-radio-button>
              <el-radio-button label="week">周</el-radio-button>
              <el-radio-button label="month">月</el-radio-button>
            </el-radio-group>
          </div>
        </div>
        <div class="chart-container" ref="utilizationChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="chart-header">
          <h3 class="chart-title">无人机类型占比</h3>
        </div>
        <div class="chart-container" ref="droneTypeChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="chart-header">
          <h3 class="chart-title">充电订单状态</h3>
        </div>
        <div class="chart-container" ref="orderStatusChartRef"></div>
      </div>
      
      <div class="chart-card large">
        <div class="chart-header">
          <h3 class="chart-title">设备电量热力图</h3>
        </div>
        <div class="chart-container" ref="heatmapChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="chart-header">
          <h3 class="chart-title">故障统计</h3>
        </div>
        <div class="chart-container" ref="faultChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="chart-header">
          <h3 class="chart-title">收入趋势</h3>
        </div>
        <div class="chart-container" ref="revenueChartRef"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useStatisticsStore } from '@/store/statistics'

const statisticsStore = useStatisticsStore()

const utilizationRange = ref('day')
const utilizationChartRef = ref(null)
const droneTypeChartRef = ref(null)
const orderStatusChartRef = ref(null)
const heatmapChartRef = ref(null)
const faultChartRef = ref(null)
const revenueChartRef = ref(null)

let charts = []

const createChart = (ref, option) => {
  if (ref.value) {
    const chart = echarts.init(ref.value)
    chart.setOption(option)
    charts.push(chart)
    return chart
  }
}

const getChartTheme = () => ({
  tooltip: {
    backgroundColor: 'rgba(20, 29, 46, 0.95)',
    borderColor: 'rgba(0, 212, 255, 0.3)',
    textStyle: { color: '#f0f4f8' }
  },
  axisLine: { lineStyle: { color: 'rgba(30, 58, 95, 0.6)' } },
  axisLabel: { color: '#94a3b8' },
  splitLine: { lineStyle: { color: 'rgba(30, 58, 95, 0.3)' } }
})

const initUtilizationChart = () => {
  const trendData = statisticsStore.trend
  const xData = trendData.map(t => t.label || t.date)
  const yData = trendData.map(t => t.utilization ?? 0)
  
  createChart(utilizationChartRef, {
    tooltip: { trigger: 'axis', ...getChartTheme().tooltip },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: xData, ...getChartTheme() },
    yAxis: { type: 'value', max: 100, axisLine: { show: false }, splitLine: getChartTheme().splitLine, axisLabel: { color: '#94a3b8', formatter: '{value}%' } },
    series: [{ name: '利用率', type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 3, color: '#00d4ff' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(0, 212, 255, 0.3)' }, { offset: 1, color: 'rgba(0, 212, 255, 0.05)' }]) }, data: yData }]
  })
}

const initDroneTypeChart = () => {
  const data = statisticsStore.distribution.droneTypes
  createChart(droneTypeChartRef, {
    tooltip: { trigger: 'item', ...getChartTheme().tooltip },
    legend: { orient: 'vertical', right: '5%', top: 'center', textStyle: { color: '#94a3b8' } },
    series: [{ name: '类型', type: 'pie', radius: ['45%', '70%'], center: ['35%', '50%'], itemStyle: { borderRadius: 8, borderColor: '#0a0e1a', borderWidth: 2 }, label: { show: false }, data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#00d4ff', '#00e676', '#ff6b35'][i] } })) : []}]
  })
}

const initOrderStatusChart = () => {
  const data = statisticsStore.distribution.orderStatus
  createChart(orderStatusChartRef, {
    tooltip: { trigger: 'item', ...getChartTheme().tooltip },
    series: [{ name: '状态', type: 'pie', radius: '70%', center: ['50%', '50%'], roseType: 'area', itemStyle: { borderRadius: 6 }, label: { color: '#94a3b8' }, data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#ffab00', '#00e676', '#29b6f6', '#5a7aa3'][i] } })) : []}]
  })
}

const initHeatmapChart = () => {
  const heatmapData = statisticsStore.heatmap
  createChart(heatmapChartRef, {
    tooltip: { position: 'top', ...getChartTheme().tooltip },
    grid: { left: '10%', right: '10%', bottom: '15%', top: '5%' },
    xAxis: { type: 'category', data: heatmapData.nests.length > 0 ? heatmapData.nests : ['NT001', 'NT002', 'NT003', 'NT004', 'NT005', 'NT006', 'NT007'], ...getChartTheme() },
    yAxis: { type: 'category', data: heatmapData.days.length > 0 ? heatmapData.days : ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], ...getChartTheme() },
    visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', inRange: { color: ['#0a0e1a', '#00d4ff'] }, textStyle: { color: '#94a3b8' } },
    series: [{ name: '利用率', type: 'heatmap', data: heatmapData.data.length > 0 ? heatmapData.data : [['NT001', '周一', 85], ['NT002', '周一', 72], ['NT003', '周一', 45], ['NT004', '周一', 90], ['NT005', '周一', 60], ['NT006', '周一', 78], ['NT007', '周一', 55], ['NT001', '周二', 78], ['NT002', '周二', 85], ['NT003', '周二', 62], ['NT004', '周二', 75], ['NT005', '周二', 80], ['NT006', '周二', 45], ['NT007', '周二', 70]], label: { show: true, color: '#fff', fontSize: 10 } }]
  })
}

const initFaultChart = () => {
  const data = statisticsStore.distribution.faultTypes
  createChart(faultChartRef, {
    tooltip: { trigger: 'axis', ...getChartTheme().tooltip },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: data.length > 0 ? data.map(d => d.name) : ['充电异常', '离线', '温度过高', '功率异常', '通信故障'], ...getChartTheme() },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: getChartTheme().splitLine, axisLabel: { color: '#94a3b8' } },
    series: [{ name: '故障数', type: 'bar', barWidth: '50%', itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#ff5252' }, { offset: 1, color: '#d32f2f' }]), borderRadius: [4, 4, 0, 0] }, data: data.length > 0 ? data.map(d => d.value) : [12, 8, 5, 15, 3] }]
  })
}

const initRevenueChart = () => {
  const data = statisticsStore.revenue
  createChart(revenueChartRef, {
    tooltip: { trigger: 'axis', ...getChartTheme().tooltip },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: data.length > 0 ? data.map(d => d.month) : ['1月', '2月', '3月', '4月', '5月', '6月'], ...getChartTheme() },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: getChartTheme().splitLine, axisLabel: { color: '#94a3b8' } },
    series: [{ name: '收入', type: 'bar', barWidth: '40%', itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#00e676' }, { offset: 1, color: '#00c853' }]), borderRadius: [4, 4, 0, 0] }, data: data.length > 0 ? data.map(d => d.revenue) : [12000, 15000, 18000, 22000, 25000, 28000] }]
  })
}

const refreshData = async () => {
  await Promise.all([
    statisticsStore.fetchTrend({ range: utilizationRange.value }),
    statisticsStore.fetchDistribution(),
    statisticsStore.fetchHeatmap(),
    statisticsStore.fetchRevenue()
  ])
  charts.forEach(c => c?.dispose())
  charts = []
  initUtilizationChart()
  initDroneTypeChart()
  initOrderStatusChart()
  initHeatmapChart()
  initFaultChart()
  initRevenueChart()
}

const handleRangeChange = async () => {
  await statisticsStore.fetchTrend({ range: utilizationRange.value })
  charts[0]?.dispose()
  charts.shift()
  initUtilizationChart()
}

const handleResize = () => charts.forEach(c => c?.resize())

onMounted(async () => {
  await Promise.all([
    statisticsStore.fetchTrend({ range: 'day' }),
    statisticsStore.fetchDistribution(),
    statisticsStore.fetchHeatmap(),
    statisticsStore.fetchRevenue()
  ])
  
  initUtilizationChart()
  initDroneTypeChart()
  initOrderStatusChart()
  initHeatmapChart()
  initFaultChart()
  initRevenueChart()
  
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  charts.forEach(c => c?.dispose())
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.statistics-page {
  padding: $space-6;
  min-height: 100%;
  overflow-y: auto;
  max-height: calc(100vh - #{$header-height});
}

// ============================================
// 页面头部
// ============================================

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: $space-6;
  
  .header-content {
    .page-title {
      font-size: $text-2xl;
      font-weight: $font-bold;
      color: $text-primary;
      margin-bottom: $space-2;
      letter-spacing: -0.02em;
    }
    
    .page-subtitle {
      font-size: $text-sm;
      color: $text-secondary;
    }
  }
  
  .header-actions {
    display: flex;
    gap: $space-3;
  }
}

// ============================================
// 图表网格
// ============================================

.charts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $space-5;
}

.chart-card {
  background: $bg-card;
  border-radius: $radius-lg;
  border: 1px solid $border-default;
  transition: all $transition-normal;
  overflow: hidden;
  
  &:hover {
    border-color: $border-primary;
    box-shadow: $shadow-glow-sm;
  }
  
  &.large {
    grid-column: span 2;
  }
  
  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-4 $space-5;
    border-bottom: 1px solid $border-subtle;
    
    .chart-title {
      font-size: $text-lg;
      font-weight: $font-semibold;
      color: $text-primary;
    }
    
    .chart-actions {
      display: flex;
      gap: $space-2;
    }
  }
  
  .chart-container {
    height: 280px;
    padding: $space-4;
  }
}

// ============================================
// 响应式适配
// ============================================

@media screen and (max-width: $breakpoint-lg) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
  
  .chart-card.large {
    grid-column: span 1;
  }
}

@media screen and (max-width: $breakpoint-sm) {
  .statistics-page {
    padding: $space-4;
  }
  
  .page-header {
    flex-direction: column;
    gap: $space-4;
    
    .header-actions {
      width: 100%;
      
      .el-button {
        flex: 1;
      }
    }
  }
}
</style>
