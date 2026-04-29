<template>
  <div class="dashboard-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">数据概览</h1>
        <p class="page-subtitle">系统运行状态实时监控</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" size="small" class="btn-primary" @click="refreshData">
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
      </div>
    </div>
    
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stats-card" v-for="stat in statsCards" :key="stat.key">
        <div class="stats-icon" :style="{ background: stat.gradient }">
          <el-icon><component :is="stat.icon" /></el-icon>
        </div>
        <div class="stats-value">{{ stat.value }}<span class="stats-unit">{{ stat.unit }}</span></div>
        <div class="stats-label">{{ stat.label }}</div>
        <div class="stats-trend" :class="stat.trend > 0 ? 'up' : 'down'">
          <el-icon><component :is="stat.trend > 0 ? 'Top' : 'Bottom'" /></el-icon>
          <span>{{ Math.abs(stat.trend) }}%</span>
          <span class="trend-label">较昨日</span>
        </div>
        <div class="stats-sparkline">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none">
            <polyline
              :points="stat.sparkline"
              fill="none"
              :stroke="stat.color"
              stroke-width="2"
            />
          </svg>
        </div>
      </div>
    </div>
    
    <!-- 图表网格 -->
    <div class="dashboard-grid">
      <div class="grid-item large">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">机巢利用率趋势</h3>
            <div class="chart-actions">
              <el-radio-group v-model="utilizationTimeRange" size="small" @change="handleRangeChange">
                <el-radio-button label="day">今日</el-radio-button>
                <el-radio-button label="week">本周</el-radio-button>
                <el-radio-button label="month">本月</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <div class="chart-container" ref="utilizationChartRef"></div>
        </div>
      </div>
      
      <div class="grid-item">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">无人机类型分布</h3>
          </div>
          <div class="chart-container" ref="droneTypeChartRef"></div>
        </div>
      </div>
      
      <div class="grid-item">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">充电订单状态</h3>
          </div>
          <div class="chart-container" ref="orderStatusChartRef"></div>
        </div>
      </div>
      
      <div class="grid-item large">
        <div class="card">
          <div class="card-header">
            <h3>实时充电状态</h3>
            <el-button type="primary" size="small" class="btn-primary" @click="refreshCharging">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
          <div class="charging-list">
            <div
              class="charging-item"
              v-for="item in chargingList"
              :key="item.order_id"
            >
              <div class="charging-drone">
                <div class="drone-avatar" :class="getDroneTypeClass(item.drone_type)">
                  <el-icon><Position /></el-icon>
                </div>
                <div class="drone-info">
                  <div class="drone-name">{{ item.drone_id }}</div>
                  <div class="drone-type">{{ getDroneTypeText(item.drone_type) }}</div>
                </div>
              </div>
              <div class="charging-nest">
                <el-icon><OfficeBuilding /></el-icon>
                <span>{{ item.nest_id }}</span>
              </div>
              <div class="charging-progress">
                <el-progress
                  :percentage="item.current_battery"
                  :stroke-width="8"
                  :color="getProgressColor(item.current_battery)"
                />
                <div class="progress-info">
                  <span>{{ item.current_battery }}%</span>
                  <span>预计剩余 {{ item.estimated_time }}分钟</span>
                </div>
              </div>
              <div class="charging-power">
                <el-icon><Lightning /></el-icon>
                <span>{{ item.charge_power }}W</span>
              </div>
            </div>
            <div v-if="chargingList.length === 0" class="empty-state">
              <el-icon><Warning /></el-icon>
              <span>暂无充电中的设备</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="grid-item">
        <div class="card">
          <div class="card-header">
            <h3>机巢状态分布</h3>
          </div>
          <div class="nest-status-list">
            <div class="status-item" v-for="status in nestStatusList" :key="status.type">
              <div class="status-indicator" :class="status.type"></div>
              <div class="status-info">
                <div class="status-label">{{ status.label }}</div>
                <div class="status-count">{{ status.count }}</div>
              </div>
              <div class="status-bar">
                <div
                  class="status-bar-fill"
                  :style="{
                    width: status.percentage + '%',
                    background: status.color
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="grid-item">
        <div class="card">
          <div class="card-header">
            <h3>最近报警</h3>
            <router-link to="/alerts">
              <el-button type="primary" link size="small">查看全部</el-button>
            </router-link>
          </div>
          <div class="alert-list">
            <div
              class="alert-item"
              v-for="alert in recentAlerts"
              :key="alert.id"
              :class="alert.type"
            >
              <div class="alert-icon">
                <el-icon>
                  <WarningFilled v-if="alert.type === 'warning'" />
                  <CircleCloseFilled v-else-if="alert.type === 'error'" />
                  <InfoFilled v-else />
                </el-icon>
              </div>
              <div class="alert-content">
                <div class="alert-title">{{ alert.title }}</div>
                <div class="alert-time">{{ formatTime(alert.timestamp) }}</div>
              </div>
            </div>
            <div v-if="recentAlerts.length === 0" class="empty-state">
              <el-icon><CircleCheck /></el-icon>
              <span>暂无报警</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useNestStore } from '@/store/nest'
import { useDroneStore } from '@/store/drone'
import { useAlertStore } from '@/store/alert'
import { useChargingStore } from '@/store/charging'
import { useStatisticsStore } from '@/store/statistics'
import { formatDateTime, getDroneTypeText, getNestStatusText } from '@/utils'

const nestStore = useNestStore()
const droneStore = useDroneStore()
const alertStore = useAlertStore()
const chargingStore = useChargingStore()
const statisticsStore = useStatisticsStore()

const utilizationChartRef = ref(null)
const droneTypeChartRef = ref(null)
const orderStatusChartRef = ref(null)
const utilizationTimeRange = ref('day')

let utilizationChart = null
let droneTypeChart = null
let orderStatusChart = null

const statsCards = computed(() => {
  const trends = statisticsStore.overview?.trends || {}
  return [
    {
      key: 'online',
      label: '在线机巢',
      value: nestStore.statistics.online,
      unit: '个',
      icon: 'OfficeBuilding',
      color: '#00d4ff',
      gradient: 'linear-gradient(135deg, #00d4ff, #0099cc)',
      trend: trends.onlineNests?.trend || 0,
      sparkline: trends.onlineNests?.sparkline || ''
    },
    {
      key: 'charging',
      label: '充电中',
      value: chargingStore.stats.chargingCount,
      unit: '架',
      icon: 'Lightning',
      color: '#ffab00',
      gradient: 'linear-gradient(135deg, #ffab00, #ff8f00)',
      trend: trends.charging?.trend || 0,
      sparkline: trends.charging?.sparkline || ''
    },
    {
      key: 'utilization',
      label: '平均利用率',
      value: nestStore.utilizationRate,
      unit: '%',
      icon: 'DataLine',
      color: '#00e676',
      gradient: 'linear-gradient(135deg, #00e676, #00c853)',
      trend: trends.utilization?.trend || 0,
      sparkline: trends.utilization?.sparkline || ''
    },
    {
      key: 'alerts',
      label: '今日报警',
      value: alertStore.stats.unread,
      unit: '条',
      icon: 'Bell',
      color: '#ff5252',
      gradient: 'linear-gradient(135deg, #ff5252, #d32f2f)',
      trend: trends.alerts?.trend || 0,
      sparkline: trends.alerts?.sparkline || ''
    }
  ]
})

const nestStatusList = computed(() => {
  const stats = nestStore.statistics
  const total = stats.total || 1
  return [
    { type: 'idle', label: '空闲', count: stats.available, color: '#00e676', percentage: Math.round((stats.available / total) * 100) },
    { type: 'occupied', label: '占用', count: stats.occupied, color: '#ffab00', percentage: Math.round((stats.occupied / total) * 100) },
    { type: 'offline', label: '离线', count: stats.total - stats.online, color: '#5a7aa3', percentage: Math.round(((stats.total - stats.online) / total) * 100) },
    { type: 'fault', label: '故障', count: stats.fault, color: '#ff5252', percentage: Math.round((stats.fault / total) * 100) }
  ]
})

const recentAlerts = computed(() => alertStore.alerts.slice(0, 5))

const chargingList = computed(() => {
  return chargingStore.chargingList.map(item => {
    const drone = droneStore.drones.find(d => d.drone_id === item.drone_id)
    const startBattery = item.start_battery || 0
    const currentBattery = item.current_battery || item.end_battery || startBattery
    const progress = Math.min(100, Math.round(((currentBattery - startBattery) / (100 - startBattery)) * 100)) || 0
    const remainingBattery = 100 - currentBattery
    const chargeRate = item.charge_power ? (item.charge_power / 1500) : 1
    const estimatedTime = item.estimated_time || Math.ceil(remainingBattery * 0.5 / chargeRate)
    return {
      ...item,
      drone_type: drone?.drone_type || 1,
      progress,
      current_battery: currentBattery,
      estimated_time: estimatedTime
    }
  })
})

const getDroneTypeClass = (type) => {
  const classes = { 1: 'fixed', 2: 'periodic', 3: 'temporary' }
  return classes[type] || ''
}

const getProgressColor = (progress) => {
  if (progress < 30) return '#ff5252'
  if (progress < 70) return '#ffab00'
  return '#00e676'
}

const formatTime = (timestamp) => formatDateTime(timestamp, 'HH:mm')

const refreshCharging = async () => {
  await chargingStore.fetchStats()
}

const refreshData = async () => {
  await Promise.all([
    nestStore.fetchNests(),
    nestStore.fetchStatistics(),
    droneStore.fetchDrones(),
    alertStore.fetchAlerts(),
    alertStore.fetchStats(),
    chargingStore.fetchStats(),
    statisticsStore.fetchOverview(),
    statisticsStore.fetchTrend({ range: utilizationTimeRange.value }),
    statisticsStore.fetchDistribution()
  ])
}

const initCharts = () => {
  if (utilizationChartRef.value) {
    utilizationChart = echarts.init(utilizationChartRef.value)
    const trendData = statisticsStore.trend
    const xData = trendData.map(t => t.label || t.date)
    const yData = trendData.map(t => t.utilization ?? 0)
    
    utilizationChart.setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(20, 29, 46, 0.95)',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        textStyle: { color: '#f0f4f8' },
        axisPointer: {
          lineStyle: { color: 'rgba(0, 212, 255, 0.3)' }
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xData.length > 0 ? xData : [],
        axisLine: { lineStyle: { color: 'rgba(30, 58, 95, 0.6)' } },
        axisLabel: { color: '#94a3b8' }
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(30, 58, 95, 0.3)' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' }
      },
      series: [{
        name: '利用率',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: '#00d4ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
            { offset: 1, color: 'rgba(0, 212, 255, 0.05)' }
          ])
        },
        data: yData
      }]
    })
  }
  
  if (droneTypeChartRef.value) {
    droneTypeChart = echarts.init(droneTypeChartRef.value)
    const data = statisticsStore.distribution.droneTypes
    
    droneTypeChart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20, 29, 46, 0.95)',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        textStyle: { color: '#f0f4f8' }
      },
      legend: {
        orient: 'vertical',
        right: '5%',
        top: 'center',
        textStyle: { color: '#94a3b8' }
      },
      series: [{
        name: '无人机类型',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#0a0e1a',
          borderWidth: 2
        },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#f0f4f8' }
        },
        data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#00d4ff', '#00e676', '#ff6b35'][i] } })) : []
      }]
    })
  }
  
  if (orderStatusChartRef.value) {
    orderStatusChart = echarts.init(orderStatusChartRef.value)
    const data = statisticsStore.distribution.orderStatus
    
    orderStatusChart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(20, 29, 46, 0.95)',
        borderColor: 'rgba(0, 212, 255, 0.3)',
        textStyle: { color: '#f0f4f8' }
      },
      series: [{
        name: '订单状态',
        type: 'pie',
        radius: '70%',
        center: ['50%', '50%'],
        roseType: 'area',
        itemStyle: {
          borderRadius: 6,
          borderColor: '#0a0e1a',
          borderWidth: 2
        },
        label: {
          color: '#94a3b8',
          formatter: '{b}\n{d}%'
        },
        data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#ffab00', '#00e676', '#29b6f6', '#5a7aa3'][i] } })) : []
      }]
    })
  }
}

const handleRangeChange = async () => {
  await statisticsStore.fetchTrend({ range: utilizationTimeRange.value })
  utilizationChart?.dispose()
  initCharts()
}

const handleResize = () => {
  utilizationChart?.resize()
  droneTypeChart?.resize()
  orderStatusChart?.resize()
}

let dashboardTimer = null

onMounted(async () => {
  await Promise.all([
    nestStore.fetchNests(),
    nestStore.fetchStatistics(),
    droneStore.fetchDrones(),
    alertStore.fetchAlerts(),
    alertStore.fetchStats(),
    chargingStore.fetchStats(),
    statisticsStore.fetchOverview(),
    statisticsStore.fetchTrend({ range: 'day' }),
    statisticsStore.fetchDistribution()
  ])
  
  initCharts()
  window.addEventListener('resize', handleResize)
  
  dashboardTimer = setInterval(async () => {
    await refreshData()
    if (utilizationChart || droneTypeChart || orderStatusChart) {
      initCharts()
    }
  }, 60000)
})

onUnmounted(() => {
  utilizationChart?.dispose()
  droneTypeChart?.dispose()
  orderStatusChart?.dispose()
  window.removeEventListener('resize', handleResize)
  if (dashboardTimer) {
    clearInterval(dashboardTimer)
    dashboardTimer = null
  }
})
</script>

<style lang="scss" scoped>
.dashboard-page {
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
// 统计网格
// ============================================

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-5;
  margin-bottom: $space-6;
}

.stats-card {
  background: $bg-card;
  border-radius: $radius-lg;
  border: 1px solid $border-default;
  padding: $space-5;
  position: relative;
  overflow: hidden;
  transition: all $transition-normal;
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: $primary-color;
    opacity: 0;
    transition: opacity $transition-normal;
  }
  
  &:hover {
    border-color: $border-primary;
    box-shadow: $shadow-glow-sm;
    transform: translateY(-2px);
    
    &::after {
      opacity: 1;
    }
  }
  
  .stats-icon {
    width: 48px;
    height: 48px;
    border-radius: $radius-lg;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $space-4;
    
    .el-icon {
      font-size: 24px;
      color: white;
    }
  }
  
  .stats-value {
    font-size: $text-3xl;
    font-weight: $font-bold;
    color: $text-primary;
    line-height: $leading-tight;
    margin-bottom: $space-1;
    
    .stats-unit {
      font-size: $text-sm;
      color: $text-secondary;
      font-weight: $font-normal;
      margin-left: $space-1;
    }
  }
  
  .stats-label {
    font-size: $text-sm;
    color: $text-secondary;
    margin-bottom: $space-3;
  }
  
  .stats-trend {
    display: flex;
    align-items: center;
    gap: $space-1;
    font-size: $text-xs;
    font-weight: $font-medium;
    
    &.up {
      color: $success-color;
    }
    
    &.down {
      color: $danger-color;
    }
    
    .trend-label {
      color: $text-muted;
      margin-left: $space-1;
    }
  }
  
  .stats-sparkline {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 100px;
    height: 30px;
    opacity: 0.3;
    
    svg {
      width: 100%;
      height: 100%;
    }
  }
}

// ============================================
// 仪表板网格
// ============================================

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $space-5;
  
  .grid-item {
    &.large {
      grid-column: span 2;
    }
  }
}

// ============================================
// 卡片和图表
// ============================================

.card {
  background: $bg-card;
  border-radius: $radius-lg;
  border: 1px solid $border-default;
  padding: $space-5;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: all $transition-normal;
  
  &:hover {
    border-color: $border-primary;
    box-shadow: $shadow-glow-sm;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $space-4;
    padding-bottom: $space-3;
    border-bottom: 1px solid $border-subtle;
    
    h3 {
      font-size: $text-lg;
      font-weight: $font-semibold;
      color: $text-primary;
    }
  }
}

.chart-card {
  background: $bg-card;
  border-radius: $radius-lg;
  border: 1px solid $border-default;
  padding: $space-5;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: all $transition-normal;
  
  &:hover {
    border-color: $border-primary;
    box-shadow: $shadow-glow-sm;
  }
  
  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $space-4;
    padding-bottom: $space-3;
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
    flex: 1;
    min-height: 250px;
  }
}

// ============================================
// 充电列表
// ============================================

.charging-list {
  flex: 1;
  overflow-y: auto;
  
  .charging-item {
    display: grid;
    grid-template-columns: 180px 120px 1fr 100px;
    align-items: center;
    gap: $space-4;
    padding: $space-4;
    background: $bg-base;
    border-radius: $radius-lg;
    margin-bottom: $space-3;
    transition: all $transition-fast;
    border: 1px solid transparent;
    
    &:hover {
      background: rgba($primary-color, 0.05);
      border-color: $border-primary;
    }
    
    .charging-drone {
      display: flex;
      align-items: center;
      gap: $space-3;
      
      .drone-avatar {
        width: 40px;
        height: 40px;
        border-radius: $radius-md;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba($primary-color, 0.2);
        
        &.fixed { background: rgba(#00d4ff, 0.2); color: #00d4ff; }
        &.periodic { background: rgba(#00e676, 0.2); color: #00e676; }
        &.temporary { background: rgba(#ff6b35, 0.2); color: #ff6b35; }
      }
      
      .drone-info {
        .drone-name {
          font-size: $text-base;
          font-weight: $font-medium;
          color: $text-primary;
        }
        
        .drone-type {
          font-size: $text-xs;
          color: $text-muted;
        }
      }
    }
    
    .charging-nest {
      display: flex;
      align-items: center;
      gap: $space-2;
      color: $text-secondary;
      font-size: $text-sm;
    }
    
    .charging-progress {
      .progress-info {
        display: flex;
        justify-content: space-between;
        margin-top: $space-2;
        font-size: $text-xs;
        color: $text-muted;
      }
    }
    
    .charging-power {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: $space-2;
      padding: $space-2 $space-3;
      background: rgba($warning-color, 0.1);
      border-radius: $radius-md;
      color: $warning-color;
      font-size: $text-sm;
      font-weight: $font-medium;
    }
  }
}

// ============================================
// 机巢状态列表
// ============================================

.nest-status-list {
  .status-item {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: $space-3;
    padding: $space-3 0;
    border-bottom: 1px solid $border-subtle;
    
    &:last-child {
      border-bottom: none;
    }
    
    .status-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      box-shadow: 0 0 8px currentColor;
      
      &.idle { background: $success-color; }
      &.occupied { background: $warning-color; }
      &.offline { background: $text-muted; }
      &.fault { background: $danger-color; }
    }
    
    .status-info {
      .status-label {
        font-size: $text-sm;
        color: $text-secondary;
        margin-bottom: 2px;
      }
      
      .status-count {
        font-size: $text-xl;
        font-weight: $font-bold;
        color: $text-primary;
      }
    }
    
    .status-bar {
      width: 80px;
      height: 6px;
      background: rgba($border-default, 0.5);
      border-radius: 3px;
      overflow: hidden;
      
      .status-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width $transition-normal;
      }
    }
  }
}

// ============================================
// 报警列表
// ============================================

.alert-list {
  .alert-item {
    display: flex;
    align-items: flex-start;
    gap: $space-3;
    padding: $space-3;
    border-radius: $radius-md;
    margin-bottom: $space-2;
    background: $bg-base;
    transition: all $transition-fast;
    border: 1px solid transparent;
    
    &:hover {
      border-color: $border-default;
    }
    
    &.warning {
      .alert-icon { color: $warning-color; }
    }
    
    &.error {
      .alert-icon { color: $danger-color; }
    }
    
    &.info {
      .alert-icon { color: $info-color; }
    }
    
    .alert-icon {
      font-size: 20px;
      margin-top: 2px;
    }
    
    .alert-content {
      flex: 1;
      
      .alert-title {
        font-size: $text-sm;
        color: $text-primary;
        margin-bottom: $space-1;
      }
      
      .alert-time {
        font-size: 11px;
        color: $text-muted;
      }
    }
  }
}

// ============================================
// 空状态
// ============================================

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $space-10;
  color: $text-muted;
  
  .el-icon {
    font-size: 32px;
    margin-bottom: $space-2;
  }
  
  span {
    font-size: $text-sm;
  }
}

// ============================================
// 响应式适配
// ============================================

@media screen and (max-width: $breakpoint-lg) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .dashboard-grid {
    grid-template-columns: 1fr;
    
    .grid-item.large {
      grid-column: span 1;
    }
  }
}

@media screen and (max-width: $breakpoint-sm) {
  .dashboard-page {
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
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .charging-item {
    grid-template-columns: 1fr !important;
    gap: $space-3 !important;
  }
}
</style>
