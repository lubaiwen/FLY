<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h1>数据概览</h1>
      <p>系统运行状态实时监控</p>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card" v-for="stat in statsCards" :key="stat.key">
        <div class="stat-icon" :style="{ background: stat.gradient }">
          <el-icon><component :is="stat.icon" /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">
            <span class="value">{{ stat.value }}</span>
            <span class="unit">{{ stat.unit }}</span>
          </div>
          <div class="stat-label">{{ stat.label }}</div>
          <div class="stat-trend" :class="stat.trend > 0 ? 'up' : 'down'">
            <el-icon><component :is="stat.trend > 0 ? 'Top' : 'Bottom'" /></el-icon>
            <span>{{ Math.abs(stat.trend) }}%</span>
            <span class="trend-label">较昨日</span>
          </div>
        </div>
        <div class="stat-sparkline">
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
    
    <div class="dashboard-grid">
      <div class="grid-item large">
        <div class="card">
          <div class="card-header">
            <h3>机巢利用率趋势</h3>
            <div class="card-actions">
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
        <div class="card">
          <div class="card-header">
            <h3>无人机类型分布</h3>
          </div>
          <div class="chart-container" ref="droneTypeChartRef"></div>
        </div>
      </div>
      
      <div class="grid-item">
        <div class="card">
          <div class="card-header">
            <h3>充电订单状态</h3>
          </div>
          <div class="chart-container" ref="orderStatusChartRef"></div>
        </div>
      </div>
      
      <div class="grid-item large">
        <div class="card">
          <div class="card-header">
            <h3>实时充电状态</h3>
            <el-button type="primary" size="small" @click="refreshCharging">
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

const statsCards = computed(() => [
  {
    key: 'online',
    label: '在线机巢',
    value: nestStore.statistics.online,
    unit: '个',
    icon: 'OfficeBuilding',
    color: '#00d4ff',
    gradient: 'linear-gradient(135deg, #00d4ff, #0099cc)',
    trend: 5.2,
    sparkline: '0,20 10,18 20,22 30,15 40,17 50,12 60,14 70,8 80,10 90,5 100,8'
  },
  {
    key: 'charging',
    label: '充电中',
    value: chargingStore.stats.chargingCount,
    unit: '架',
    icon: 'Lightning',
    color: '#ffab00',
    gradient: 'linear-gradient(135deg, #ffab00, #ff8f00)',
    trend: 12.8,
    sparkline: '0,15 10,12 20,18 30,10 40,15 50,8 60,12 70,6 80,10 90,4 100,8'
  },
  {
    key: 'utilization',
    label: '平均利用率',
    value: nestStore.utilizationRate,
    unit: '%',
    icon: 'DataLine',
    color: '#00e676',
    gradient: 'linear-gradient(135deg, #00e676, #00c853)',
    trend: -2.4,
    sparkline: '0,10 10,12 20,8 30,15 40,10 50,18 60,12 70,20 80,15 90,18 100,12'
  },
  {
    key: 'alerts',
    label: '今日报警',
    value: alertStore.stats.unread,
    unit: '条',
    icon: 'Bell',
    color: '#ff5252',
    gradient: 'linear-gradient(135deg, #ff5252, #d32f2f)',
    trend: -8.5,
    sparkline: '0,25 10,20 20,22 30,18 40,20 50,15 60,18 70,12 80,15 90,10 100,12'
  }
])

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

const initCharts = () => {
  if (utilizationChartRef.value) {
    utilizationChart = echarts.init(utilizationChartRef.value)
    const trendData = statisticsStore.trend
    const xData = trendData.map(t => t.label || t.date)
    const yData = trendData.map(t => t.utilization || Math.floor(Math.random() * 30) + 50)
    
    utilizationChart.setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 40, 71, 0.95)',
        borderColor: '#1e3a5f',
        textStyle: { color: '#fff' }
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
        data: xData.length > 0 ? xData : ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
        axisLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#8ba3c7' }
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#8ba3c7', formatter: '{value}%' }
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
        data: yData.length > 0 ? yData : [45, 52, 68, 75, 82, 78, 72]
      }]
    })
  }
  
  if (droneTypeChartRef.value) {
    droneTypeChart = echarts.init(droneTypeChartRef.value)
    const data = statisticsStore.distribution.droneTypes
    
    droneTypeChart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 40, 71, 0.95)',
        borderColor: '#1e3a5f',
        textStyle: { color: '#fff' }
      },
      legend: {
        orient: 'vertical',
        right: '5%',
        top: 'center',
        textStyle: { color: '#8ba3c7' }
      },
      series: [{
        name: '无人机类型',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#0a1628',
          borderWidth: 2
        },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#fff' }
        },
        data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#00d4ff', '#00e676', '#ff6b35'][i] } })) : [
          { value: 35, name: '固定路线', itemStyle: { color: '#00d4ff' } },
          { value: 28, name: '周期性', itemStyle: { color: '#00e676' } },
          { value: 15, name: '临时性', itemStyle: { color: '#ff6b35' } }
        ]
      }]
    })
  }
  
  if (orderStatusChartRef.value) {
    orderStatusChart = echarts.init(orderStatusChartRef.value)
    const data = statisticsStore.distribution.orderStatus
    
    orderStatusChart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 40, 71, 0.95)',
        borderColor: '#1e3a5f',
        textStyle: { color: '#fff' }
      },
      series: [{
        name: '订单状态',
        type: 'pie',
        radius: '70%',
        center: ['50%', '50%'],
        roseType: 'area',
        itemStyle: {
          borderRadius: 6,
          borderColor: '#0a1628',
          borderWidth: 2
        },
        label: {
          color: '#8ba3c7',
          formatter: '{b}\n{d}%'
        },
        data: data.length > 0 ? data.map((d, i) => ({ ...d, itemStyle: { color: ['#ffab00', '#00e676', '#29b6f6', '#5a7aa3'][i] } })) : [
          { value: 45, name: '充电中', itemStyle: { color: '#ffab00' } },
          { value: 120, name: '已完成', itemStyle: { color: '#00e676' } },
          { value: 8, name: '待支付', itemStyle: { color: '#29b6f6' } },
          { value: 5, name: '已取消', itemStyle: { color: '#5a7aa3' } }
        ]
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

onMounted(async () => {
  await Promise.all([
    nestStore.fetchNests(),
    nestStore.fetchStatistics(),
    droneStore.fetchDrones(),
    alertStore.fetchAlerts(),
    alertStore.fetchStats(),
    chargingStore.fetchStats(),
    statisticsStore.fetchTrend({ range: 'day' }),
    statisticsStore.fetchDistribution()
  ])
  
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  utilizationChart?.dispose()
  droneTypeChart?.dispose()
  orderStatusChart?.dispose()
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.dashboard-page {
  padding: 24px;
  min-height: 100%;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
}

.page-header {
  margin-bottom: 24px;
  
  h1 {
    font-size: 24px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 4px;
  }
  
  p {
    font-size: 14px;
    color: $text-secondary;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  padding: 20px;
  position: relative;
  overflow: hidden;
  transition: all $transition-normal;
  
  &:hover {
    border-color: $primary-color;
    transform: translateY(-2px);
    box-shadow: $shadow-glow;
  }
  
  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    
    .el-icon {
      font-size: 24px;
      color: white;
    }
  }
  
  .stat-info {
    .stat-value {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-bottom: 4px;
      
      .value {
        font-size: 28px;
        font-weight: 700;
        color: $text-primary;
      }
      
      .unit {
        font-size: 14px;
        color: $text-secondary;
      }
    }
    
    .stat-label {
      font-size: 13px;
      color: $text-secondary;
      margin-bottom: 8px;
    }
    
    .stat-trend {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      
      &.up {
        color: $success-color;
      }
      
      &.down {
        color: $danger-color;
      }
      
      .trend-label {
        color: $text-muted;
      }
    }
  }
  
  .stat-sparkline {
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

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  
  .grid-item {
    &.large {
      grid-column: span 2;
    }
  }
}

.card {
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    
    h3 {
      font-size: 16px;
      font-weight: 600;
      color: $text-primary;
    }
  }
  
  .chart-container {
    flex: 1;
    min-height: 250px;
  }
}

.charging-list {
  flex: 1;
  overflow-y: auto;
  
  .charging-item {
    display: grid;
    grid-template-columns: 180px 120px 1fr 100px;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: rgba($bg-darker, 0.5);
    border-radius: 10px;
    margin-bottom: 12px;
    transition: all $transition-fast;
    
    &:hover {
      background: rgba($primary-color, 0.05);
    }
    
    .charging-drone {
      display: flex;
      align-items: center;
      gap: 12px;
      
      .drone-avatar {
        width: 40px;
        height: 40px;
        border-radius: 10px;
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
          font-size: 14px;
          font-weight: 500;
          color: $text-primary;
        }
        
        .drone-type {
          font-size: 12px;
          color: $text-muted;
        }
      }
    }
    
    .charging-nest {
      display: flex;
      align-items: center;
      gap: 8px;
      color: $text-secondary;
      font-size: 13px;
    }
    
    .charging-progress {
      .progress-info {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 12px;
        color: $text-muted;
      }
    }
    
    .charging-power {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba($warning-color, 0.1);
      border-radius: 8px;
      color: $warning-color;
      font-size: 13px;
      font-weight: 500;
    }
  }
}

.nest-status-list {
  .status-item {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid $border-color;
    
    &:last-child {
      border-bottom: none;
    }
    
    .status-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      
      &.idle { background: $success-color; }
      &.occupied { background: $warning-color; }
      &.offline { background: $text-muted; }
      &.fault { background: $danger-color; }
    }
    
    .status-info {
      .status-label {
        font-size: 13px;
        color: $text-secondary;
        margin-bottom: 2px;
      }
      
      .status-count {
        font-size: 18px;
        font-weight: 600;
        color: $text-primary;
      }
    }
    
    .status-bar {
      width: 80px;
      height: 6px;
      background: rgba($border-color, 0.5);
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

.alert-list {
  .alert-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 8px;
    background: rgba($bg-darker, 0.5);
    
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
        font-size: 13px;
        color: $text-primary;
        margin-bottom: 4px;
      }
      
      .alert-time {
        font-size: 11px;
        color: $text-muted;
      }
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: $text-muted;
  
  .el-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }
  
  span {
    font-size: 13px;
  }
}

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
    padding: 16px;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .charging-item {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
}
</style>
