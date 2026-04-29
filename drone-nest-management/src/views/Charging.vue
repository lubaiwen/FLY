<template>
  <div class="charging-page">
    <div class="page-header">
      <div class="header-left">
        <h1>充电管理</h1>
        <p>监控和管理所有充电任务</p>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="startCharging">
          <el-icon><Lightning /></el-icon>
          启动充电
        </el-button>
      </div>
    </div>
    
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon charging">
          <el-icon><Lightning /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ chargingStore.stats.chargingCount }}</div>
          <div class="stat-label">充电中</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon waiting">
          <el-icon><Clock /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ chargingStore.stats.waitingCount }}</div>
          <div class="stat-label">等待中</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon completed">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ chargingStore.stats.completedCount }}</div>
          <div class="stat-label">今日完成</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon power">
          <el-icon><TrendCharts /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ chargingStore.stats.totalPower }}kWh</div>
          <div class="stat-label">今日耗电</div>
        </div>
      </div>
    </div>
    
    <div class="content-grid">
      <div class="main-section">
        <div class="card">
          <div class="card-header">
            <h3>充电任务列表</h3>
            <el-radio-group v-model="activeTab" size="small">
              <el-radio-button label="charging">充电中</el-radio-button>
              <el-radio-button label="waiting">等待中</el-radio-button>
              <el-radio-button label="completed">已完成</el-radio-button>
            </el-radio-group>
          </div>
          
          <div class="charging-list">
            <div
              class="charging-item"
              v-for="item in displayList"
              :key="item.order_id"
            >
              <div class="item-header">
                <div class="order-id">{{ item.order_id }}</div>
                <el-tag :type="getStatusType(item.status)" size="small">
                  {{ getStatusText(item.status) }}
                </el-tag>
              </div>
              
              <div class="item-body">
                <div class="info-row">
                  <div class="info-item">
                    <el-icon><Position /></el-icon>
                    <span>{{ item.drone_id }}</span>
                  </div>
                  <div class="info-item">
                    <el-icon><OfficeBuilding /></el-icon>
                    <span>{{ item.nest_id || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <el-icon><Lightning /></el-icon>
                    <span>{{ item.charge_power }}W</span>
                  </div>
                </div>
                
                <div class="progress-section" v-if="item.status === 0">
                  <div class="progress-header">
                    <span>充电进度</span>
                    <span>{{ item.current_battery }}%</span>
                  </div>
                  <el-progress
                    :percentage="item.current_battery"
                    :stroke-width="10"
                    :color="getProgressColor(item.current_battery)"
                  />
                  <div class="progress-footer">
                    <span>预计剩余 {{ item.estimated_time }} 分钟</span>
                    <span>已充 {{ item.charged_time }} 分钟</span>
                  </div>
                </div>
                
                <div class="time-info" v-else>
                  <div class="time-item">
                    <span class="label">开始时间</span>
                    <span class="value">{{ formatTime(item.start_time) }}</span>
                  </div>
                  <div class="time-item" v-if="item.end_time">
                    <span class="label">结束时间</span>
                    <span class="value">{{ formatTime(item.end_time) }}</span>
                  </div>
                  <div class="time-item" v-if="item.duration">
                    <span class="label">充电时长</span>
                    <span class="value">{{ item.duration }}分钟</span>
                  </div>
                </div>
              </div>
              
              <div class="item-footer">
                <div class="fee" v-if="item.fee">
                  <span class="label">费用：</span>
                  <span class="value">¥{{ item.fee }}</span>
                </div>
                <div class="actions">
                  <el-button
                    type="danger"
                    size="small"
                    v-if="item.status === 0"
                    @click="stopCharging(item)"
                  >
                    停止充电
                  </el-button>
                </div>
              </div>
            </div>
            
            <div v-if="displayList.length === 0" class="empty-state">
              <el-icon><Document /></el-icon>
              <span>暂无{{ tabLabels[activeTab] }}任务</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="side-section">
        <div class="card">
          <div class="card-header">
            <h3>实时功率</h3>
          </div>
          <div class="power-chart" ref="powerChartRef"></div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h3>快速调度</h3>
          </div>
          <div class="quick-schedule">
            <el-form label-width="80px" size="small">
              <el-form-item label="无人机">
                <el-select v-model="quickSchedule.drone_id" placeholder="选择无人机">
                  <el-option
                    v-for="drone in lowBatteryDrones"
                    :key="drone.drone_id"
                    :label="`${drone.drone_id} (${drone.current_battery}%)`"
                    :value="drone.drone_id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="紧急程度">
                <el-rate v-model="quickSchedule.emergency_level" :max="5" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="submitQuickSchedule" style="width: 100%">
                  立即调度
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </div>
    </div>
    
    <el-dialog v-model="showStartDialog" title="启动充电" width="450px">
      <el-form ref="startFormRef" :model="startForm" :rules="startRules" label-width="100px">
        <el-form-item label="无人机" prop="drone_id">
          <el-select v-model="startForm.drone_id" placeholder="选择无人机" style="width: 100%">
            <el-option
              v-for="drone in droneStore.drones"
              :key="drone.drone_id"
              :label="drone.drone_id"
              :value="drone.drone_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="机巢" prop="nest_id">
          <el-select v-model="startForm.nest_id" placeholder="选择机巢" style="width: 100%">
            <el-option
              v-for="nest in nestStore.availableNests"
              :key="nest.nest_id"
              :label="nest.nest_id"
              :value="nest.nest_id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showStartDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmStart">确认启动</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { useDroneStore } from '@/store/drone'
import { useNestStore } from '@/store/nest'
import { useChargingStore } from '@/store/charging'

const droneStore = useDroneStore()
const nestStore = useNestStore()
const chargingStore = useChargingStore()

const activeTab = ref('charging')
const showStartDialog = ref(false)
const powerChartRef = ref(null)
let powerChart = null
let refreshTimer = null

const startForm = reactive({
  drone_id: '',
  nest_id: ''
})

const startRules = {
  drone_id: [{ required: true, message: '请选择无人机', trigger: 'change' }],
  nest_id: [{ required: true, message: '请选择机巢', trigger: 'change' }]
}

const quickSchedule = reactive({
  drone_id: '',
  emergency_level: 3
})

const displayList = computed(() => {
  switch (activeTab.value) {
    case 'charging': return chargingStore.chargingList.map(item => ({
      ...item,
      status: item.status,
      charged_time: item.charge_duration || 0
    }))
    case 'waiting': return chargingStore.waitingList.map(item => ({
      ...item,
      status: item.status
    }))
    case 'completed': return chargingStore.completedList.map(item => ({
      ...item,
      status: item.status,
      duration: item.charge_duration || 0
    }))
    default: return []
  }
})

const lowBatteryDrones = computed(() => 
  droneStore.drones.filter(d => d.current_battery < 30)
)

const tabLabels = {
  charging: '充电中',
  waiting: '等待中',
  completed: '已完成'
}

const getStatusType = (status) => {
  const types = { 0: 'primary', 1: 'success', 2: 'warning' }
  return types[status] || ''
}

const getStatusText = (status) => {
  const texts = { 0: '充电中', 1: '已完成', 2: '已中断' }
  return texts[status] || status
}

const getProgressColor = (progress) => {
  if (progress < 30) return '#ff5252'
  if (progress < 70) return '#ffab00'
  return '#00e676'
}

const formatTime = (time) => {
  if (!time) return '-'
  const date = new Date(time)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const startCharging = () => {
  showStartDialog.value = true
}

const confirmStart = async () => {
  try {
    await chargingStore.createCharging({
      drone_id: startForm.drone_id,
      nest_id: startForm.nest_id
    })
    ElMessage.success('充电任务已启动')
    showStartDialog.value = false
    startForm.drone_id = ''
    startForm.nest_id = ''
  } catch (error) {
    ElMessage.error(error.message || '启动失败')
  }
}

const stopCharging = (item) => {
  ElMessageBox.confirm('确定要停止充电吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await chargingStore.stopCharging(item.order_id)
      ElMessage.success('充电已停止')
    } catch (error) {
      ElMessage.error(error.message || '停止失败')
    }
  }).catch(() => {})
}

const cancelWaiting = (item) => {
  ElMessageBox.confirm('确定要取消等待吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    chargingStore.cancelWaiting(item.order_id)
    ElMessage.success('已取消等待')
  }).catch(() => {})
}

const submitQuickSchedule = () => {
  if (!quickSchedule.drone_id) {
    ElMessage.warning('请选择无人机')
    return
  }
  ElMessage.success('调度请求已提交')
}

const initPowerChart = () => {
  if (powerChartRef.value) {
    powerChart = echarts.init(powerChartRef.value)
    powerChart.setOption({
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
        data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
        axisLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#8ba3c7' }
      },
      yAxis: {
        type: 'value',
        name: 'kW',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e3a5f' } },
        axisLabel: { color: '#8ba3c7' }
      },
      series: [{
        name: '功率',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#ffab00' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 171, 0, 0.3)' },
            { offset: 1, color: 'rgba(255, 171, 0, 0.05)' }
          ])
        },
        data: [2.5, 3.2, 5.8, 8.2, 7.5, 6.8, 4.2]
      }]
    })
  }
}

const handleResize = () => {
  powerChart?.resize()
}

onMounted(async () => {
  await Promise.all([
    droneStore.fetchDrones(),
    nestStore.fetchNests(),
    chargingStore.fetchStats()
  ])
  initPowerChart()
  window.addEventListener('resize', handleResize)

  refreshTimer = setInterval(() => {
    chargingStore.fetchStats()
  }, 10000)
})

onUnmounted(() => {
  powerChart?.dispose()
  window.removeEventListener('resize', handleResize)
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="scss" scoped>
.charging-page {
  padding: 24px;
  min-height: 100%;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  
  .header-left {
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
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  
  .stat-card {
    background: $bg-card;
    border-radius: $border-radius;
    border: 1px solid $border-color;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    
    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      
      .el-icon {
        font-size: 24px;
        color: white;
      }
      
      &.charging { background: linear-gradient(135deg, #ffab00, #ff8f00); }
      &.waiting { background: linear-gradient(135deg, #29b6f6, #0288d1); }
      &.completed { background: linear-gradient(135deg, #00e676, #00c853); }
      &.power { background: linear-gradient(135deg, #ab47bc, #7b1fa2); }
    }
    
    .stat-content {
      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: $text-primary;
      }
      
      .stat-label {
        font-size: 13px;
        color: $text-secondary;
      }
    }
  }
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
}

.card {
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid $border-color;
    
    h3 {
      font-size: 15px;
      font-weight: 600;
      color: $text-primary;
    }
  }
}

.charging-list {
  padding: 16px;
  max-height: 600px;
  overflow-y: auto;
  
  .charging-item {
    background: rgba($bg-darker, 0.5);
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 12px;
    
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      
      .order-id {
        font-weight: 600;
        color: $text-primary;
      }
    }
    
    .item-body {
      .info-row {
        display: flex;
        gap: 24px;
        margin-bottom: 12px;
        
        .info-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: $text-secondary;
        }
      }
      
      .progress-section {
        .progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 13px;
          color: $text-secondary;
        }
        
        .progress-footer {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 12px;
          color: $text-muted;
        }
      }
      
      .time-info {
        display: flex;
        gap: 24px;
        
        .time-item {
          .label {
            font-size: 12px;
            color: $text-muted;
            margin-right: 8px;
          }
          
          .value {
            font-size: 13px;
            color: $text-primary;
          }
        }
      }
    }
    
    .item-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid $border-color;
      
      .fee {
        .label {
          color: $text-muted;
          font-size: 13px;
        }
        
        .value {
          font-size: 16px;
          font-weight: 600;
          color: $warning-color;
        }
      }
    }
  }
}

.side-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.power-chart {
  height: 200px;
  padding: 16px;
}

.quick-schedule {
  padding: 16px;
  
  :deep(.el-form-item) {
    margin-bottom: 16px;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  color: $text-muted;
  
  .el-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }
}

@media screen and (max-width: $breakpoint-lg) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
