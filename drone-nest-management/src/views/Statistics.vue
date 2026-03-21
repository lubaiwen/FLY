<template>
  <div class="statistics-page">
    <div class="page-header">
      <h1>数据统计</h1>
      <p>系统运营数据分析</p>
    </div>
    
    <div class="charts-grid">
      <div class="chart-card large">
        <div class="card-header"><h3>机巢利用率趋势</h3>
          <el-radio-group v-model="utilizationRange" size="small" @change="handleRangeChange">
            <el-radio-button label="day">日</el-radio-button>
            <el-radio-button label="week">周</el-radio-button>
            <el-radio-button label="month">月</el-radio-button>
          </el-radio-group>
        </div>
        <div class="chart-container" ref="utilizationChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="card-header"><h3>无人机类型占比</h3></div>
        <div class="chart-container" ref="droneTypeChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="card-header"><h3>充电订单状态</h3></div>
        <div class="chart-container" ref="orderStatusChartRef"></div>
      </div>
      
      <div class="chart-card large">
        <div class="card-header"><h3>设备电量热力图</h3></div>
        <div class="chart-container" ref="heatmapChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="card-header"><h3>故障统计</h3></div>
        <div class="chart-container" ref="faultChartRef"></div>
      </div>
      
      <div class="chart-card">
        <div class="card-header"><h3>收入趋势</h3></div>
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

const initUtilizationChart = () => {
  const trendData = statisticsStore.trend
  const xData = trendData.map(t => t.label || t.date)
  const yData = trendData.map(t => t.utilization || Math.floor(Math.random() * 30) + 50)
  
  createChart(utilizationChartRef, {
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15, 40, 71, 0.95)', borderColor: '#1e3a5f', textStyle: { color: '#fff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: xData.length > 0 ? xData : ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'], axisLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7' } },
    yAxis: { type: 'value', max: 100, axisLine: { show: false }, splitLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7', formatter: '{value}%' } },
    series: [{ name: '利用率', type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 3, color: '#00d4ff' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(0, 212, 255, 0.3)' }, { offset: 1, color: 'rgba(0, 212, 255, 0.05)' }]) }, data: yData.length > 0 ? yData : [45, 52, 68, 75, 82, 78, 72] }]
  })
}

const initDroneTypeChart = () => {
  const data = statisticsStore.distribution.droneTypes
  createChart(droneTypeChartRef, {
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15, 40, 71, 0.95)', borderColor: '#1e3a5f', textStyle: { color: '#fff' } },
    legend: { orient: 'vertical', right: '5%', top: 'center', textStyle: { color: '#8ba3c7' } },
    series: [{ name: '类型', type: 'pie', radius: ['45%', '70%'], center: ['35%', '50%'], itemStyle: { borderRadius: 8, borderColor: '#0a1628', borderWidth: 2 }, label: { show: false }, data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#00d4ff', '#00e676', '#ff6b35'][i] } })) : [
      { value: 35, name: '固定路线', itemStyle: { color: '#00d4ff' } },
      { value: 28, name: '周期性', itemStyle: { color: '#00e676' } },
      { value: 15, name: '临时性', itemStyle: { color: '#ff6b35' } }
    ]}]
  })
}

const initOrderStatusChart = () => {
  const data = statisticsStore.distribution.orderStatus
  createChart(orderStatusChartRef, {
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15, 40, 71, 0.95)', borderColor: '#1e3a5f', textStyle: { color: '#fff' } },
    series: [{ name: '状态', type: 'pie', radius: '70%', center: ['50%', '50%'], roseType: 'area', itemStyle: { borderRadius: 6 }, label: { color: '#8ba3c7' }, data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#ffab00', '#00e676', '#29b6f6', '#5a7aa3'][i] } })) : [
      { value: 45, name: '充电中', itemStyle: { color: '#ffab00' } },
      { value: 120, name: '已完成', itemStyle: { color: '#00e676' } },
      { value: 8, name: '待支付', itemStyle: { color: '#29b6f6' } }
    ]}]
  })
}

const initHeatmapChart = () => {
  const heatmapData = statisticsStore.heatmap
  createChart(heatmapChartRef, {
    tooltip: { position: 'top', backgroundColor: 'rgba(15, 40, 71, 0.95)', borderColor: '#1e3a5f', textStyle: { color: '#fff' } },
    grid: { left: '10%', right: '10%', bottom: '15%', top: '5%' },
    xAxis: { type: 'category', data: heatmapData.nests.length > 0 ? heatmapData.nests : ['NT001', 'NT002', 'NT003', 'NT004', 'NT005', 'NT006', 'NT007'], axisLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7' } },
    yAxis: { type: 'category', data: heatmapData.days.length > 0 ? heatmapData.days : ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], axisLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7' } },
    visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', inRange: { color: ['#0a1628', '#00d4ff'] }, textStyle: { color: '#8ba3c7' } },
    series: [{ name: '利用率', type: 'heatmap', data: heatmapData.data.length > 0 ? heatmapData.data : [['NT001', '周一', 85], ['NT002', '周一', 72], ['NT003', '周一', 45], ['NT004', '周一', 90], ['NT005', '周一', 60], ['NT006', '周一', 78], ['NT007', '周一', 55], ['NT001', '周二', 78], ['NT002', '周二', 85], ['NT003', '周二', 62], ['NT004', '周二', 75], ['NT005', '周二', 80], ['NT006', '周二', 45], ['NT007', '周二', 70]], label: { show: true, color: '#fff', fontSize: 10 } }]
  })
}

const initFaultChart = () => {
  const data = statisticsStore.distribution.faultTypes
  createChart(faultChartRef, {
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15, 40, 71, 0.95)', borderColor: '#1e3a5f', textStyle: { color: '#fff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: data.length > 0 ? data.map(d => d.name) : ['充电异常', '离线', '温度过高', '功率异常', '通信故障'], axisLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7' } },
    series: [{ name: '故障数', type: 'bar', barWidth: '50%', itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#ff5252' }, { offset: 1, color: '#d32f2f' }]), borderRadius: [4, 4, 0, 0] }, data: data.length > 0 ? data.map(d => d.value) : [12, 8, 5, 15, 3] }]
  })
}

const initRevenueChart = () => {
  const data = statisticsStore.revenue
  createChart(revenueChartRef, {
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15, 40, 71, 0.95)', borderColor: '#1e3a5f', textStyle: { color: '#fff' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: data.length > 0 ? data.map(d => d.month) : ['1月', '2月', '3月', '4月', '5月', '6月'], axisLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7' } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#1e3a5f' } }, axisLabel: { color: '#8ba3c7' } },
    series: [{ name: '收入', type: 'bar', barWidth: '40%', itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#00e676' }, { offset: 1, color: '#00c853' }]), borderRadius: [4, 4, 0, 0] }, data: data.length > 0 ? data.map(d => d.revenue) : [12000, 15000, 18000, 22000, 25000, 28000] }]
  })
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
.statistics-page { padding: 24px; min-height: 100%; overflow-y: auto; max-height: calc(100vh - 64px); }
.page-header { margin-bottom: 20px; h1 { font-size: 24px; font-weight: 600; color: $text-primary; margin-bottom: 4px; } p { font-size: 14px; color: $text-secondary; } }
.charts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.chart-card { background: $bg-card; border-radius: $border-radius; border: 1px solid $border-color; &.large { grid-column: span 2; } .card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid $border-color; h3 { font-size: 15px; font-weight: 600; color: $text-primary; } } .chart-container { height: 280px; padding: 16px; } }
@media screen and (max-width: $breakpoint-lg) { .charts-grid { grid-template-columns: 1fr; } .chart-card.large { grid-column: span 1; } }
</style>
