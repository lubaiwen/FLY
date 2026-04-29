<template>
  <div class="scheduling-container">
    <el-row :gutter="20">
      <el-col :span="16">
        <el-card class="map-card">
          <template #header>
            <div class="card-header">
              <span>实时调度地图</span>
              <el-button-group>
                <el-select v-model="selectedAlgorithm" size="default" style="width: 150px; margin-right: 8px;">
                  <el-option label="距离优先" value="nearest" />
                  <el-option label="GAT-PPO智能匹配" value="gat_ppo" />
                </el-select>
                <el-button type="primary" @click="runScheduling" :loading="scheduling">
                  执行调度
                </el-button>
                <el-button :type="schedulerRunning ? 'danger' : 'success'" @click="toggleScheduler">
                  {{ schedulerRunning ? '停止调度' : '启动调度' }}
                </el-button>
              </el-button-group>
            </div>
          </template>
          <div id="map-container" class="map-container"></div>
        </el-card>
      </el-col>
      
      <el-col :span="8">
        <el-card class="status-card">
          <template #header>
            <span>调度状态</span>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="调度器状态">
              <el-tag :type="schedulerStatus.state === 'running' ? 'success' : 'info'">
                {{ schedulerStatus.state }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="调度周期">
              {{ schedulerStatus.dispatch_interval }}秒
            </el-descriptions-item>
            <el-descriptions-item label="算法类型">
              {{ algorithmLabels[schedulerStatus.algorithm] || '距离优先' }}
            </el-descriptions-item>
            <el-descriptions-item label="待处理请求">
              {{ schedulerStatus.pending_requests }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
        
        <el-card class="metrics-card" style="margin-top: 20px;">
          <template #header>
            <span>调度指标</span>
          </template>
          <el-row :gutter="10">
            <el-col :span="12">
              <el-statistic title="总调度次数" :value="metrics.total_schedules" />
            </el-col>
            <el-col :span="12">
              <el-statistic title="总匹配数" :value="metrics.total_matchings" />
            </el-col>
          </el-row>
          <el-row :gutter="10" style="margin-top: 20px;">
            <el-col :span="12">
              <el-statistic title="平均计算时间" :value="metrics.avg_computation_time" suffix="ms" :precision="2" />
            </el-col>
            <el-col :span="12">
              <el-statistic title="平均优势值" :value="metrics.avg_advantage" :precision="2" />
            </el-col>
          </el-row>
          <el-row :gutter="10" style="margin-top: 20px;">
            <el-col :span="12">
              <el-statistic title="累计节能" :value="metrics.total_energy_saved" suffix="Wh" :precision="2" />
            </el-col>
            <el-col :span="12">
              <el-statistic title="紧急响应" :value="metrics.emergency_responses" />
            </el-col>
          </el-row>
        </el-card>
        
        <el-card class="matchings-card" style="margin-top: 20px;">
          <template #header>
            <div class="card-header">
              <span>最近匹配结果</span>
              <el-tag>{{ recentMatchings.length }} 条</el-tag>
            </div>
          </template>
          <el-table :data="recentMatchings" max-height="300" size="small">
            <el-table-column prop="drone_id" label="无人机" width="100" />
            <el-table-column prop="nest_id" label="机槽" width="100" />
            <el-table-column prop="advantage_value" label="优势值" width="80">
              <template #default="{ row }">
                {{ row.advantage_value?.toFixed(2) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="24">
        <el-card>
          <template #header>
            <span>调度结果可视化</span>
          </template>
          <div ref="chartRef" style="height: 300px;"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { schedulingApi, websocketApi } from '@/api/scheduling'
import { droneApi } from '@/api/drone'
import { nestApi } from '@/api/nest'
import { loadAmap, MAP_CENTER } from '@/utils/amap'

const scheduling = ref(false)
const selectedAlgorithm = ref('gat_ppo')
const algorithmLabels = {
  nearest: '距离优先',
  gat_ppo: 'GAT-PPO智能匹配',
  km: 'KM算法',
  greedy: '贪心算法'
}
const schedulerRunning = ref(false)
const schedulerStatus = ref({
  state: 'idle',
  dispatch_interval: 2,
  algorithm: 'km',
  pending_requests: 0,
})
const metrics = ref({
  total_schedules: 0,
  total_matchings: 0,
  avg_computation_time: 0,
  avg_advantage: 0,
  total_energy_saved: 0,
  emergency_responses: 0,
})
const recentMatchings = ref([])
const drones = ref([])
const nests = ref([])
const chartRef = ref(null)
let chart = null
let wsConnection = null
let map = null
let droneMarkers = {}
let nestMarkers = {}
let statusTimer = null

const normalizeDroneList = (res) => {
  return res?.data?.list || res?.list || []
}

const normalizeNestList = (res) => {
  return res?.data?.list || res?.list || []
}

const getDronePosition = (drone) => {
  const lng = drone?.position?.lng ?? drone?.longitude
  const lat = drone?.position?.lat ?? drone?.latitude
  if (lng === undefined || lat === undefined) {
    return null
  }
  return [Number(lng), Number(lat)]
}

const getNestPosition = (nest) => {
  const lng = nest?.position?.lng ?? nest?.longitude
  const lat = nest?.position?.lat ?? nest?.latitude
  if (lng === undefined || lat === undefined) {
    return null
  }
  return [Number(lng), Number(lat)]
}

const loadDrones = async () => {
  try {
    const res = await droneApi.getList({ pageSize: 200 })
    drones.value = normalizeDroneList(res)
    updateMapMarkers()
  } catch (error) {
    console.error('Failed to load drones:', error)
  }
}

const loadNests = async () => {
  try {
    const res = await nestApi.getList({ pageSize: 200 })
    nests.value = normalizeNestList(res)
    updateMapMarkers()
  } catch (error) {
    console.error('Failed to load nests:', error)
  }
}

const loadSchedulerStatus = async () => {
  try {
    const res = await schedulingApi.getSchedulerStatus()
    const data = res?.data || {}
    schedulerStatus.value = {
      ...schedulerStatus.value,
      state: data.is_running ? 'running' : 'idle',
      dispatch_interval: data.dispatch_interval ?? schedulerStatus.value.dispatch_interval,
      algorithm: data.algorithm ?? schedulerStatus.value.algorithm,
      pending_requests: metrics.value.running_tasks || 0
    }
    schedulerRunning.value = !!data.is_running
  } catch (error) {
    console.error('Failed to load scheduler status:', error)
  }
}

const loadMetrics = async () => {
  try {
    const res = await schedulingApi.getMetrics()
    const data = res?.data || {}
    metrics.value = {
      total_schedules: data.total_tasks || 0,
      total_matchings: data.completed_tasks || 0,
      avg_computation_time: data.avg_execution_time || 0,
      avg_advantage: data.success_rate ? Number(data.success_rate) : 0,
      total_energy_saved: 0,
      emergency_responses: data.failed_tasks || 0,
      running_tasks: data.running_tasks || 0
    }
    schedulerStatus.value = {
      ...schedulerStatus.value,
      pending_requests: data.running_tasks || 0
    }
  } catch (error) {
    console.error('Failed to load metrics:', error)
  }
}

const runScheduling = async () => {
  scheduling.value = true
  try {
    const droneIds = drones.value.slice(0, 20).map(item => item.drone_id)
    if (droneIds.length === 0) {
      ElMessage.warning('暂无可调度无人机')
      return
    }
    const res = await schedulingApi.runScheduling({
      drones: droneIds,
      algorithm: selectedAlgorithm.value,
      optimization_type: 'charge',
      constraints: { priority: 1 }
    })
    const result = res?.data
    if (result) {
      const assignments = result.assignments || []
      schedulerStatus.value = {
        ...schedulerStatus.value,
        algorithm: result.algorithm || selectedAlgorithm.value
      }
      ElMessage.success(`调度完成，匹配 ${assignments.length} 架无人机`)
      recentMatchings.value = assignments.slice(0, 20)
      updateChart({
        drones_matched: assignments.length,
        total_advantage: assignments.length,
        computation_time: 0.1
      })
    }
  } catch (error) {
    ElMessage.error('调度执行失败')
  } finally {
    scheduling.value = false
  }
}

const toggleScheduler = async () => {
  try {
    if (schedulerRunning.value) {
      await schedulingApi.stopScheduler()
      ElMessage.success('调度器已停止')
    } else {
      await schedulingApi.startScheduler()
      ElMessage.success('调度器已启动')
    }
    await loadSchedulerStatus()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const initChart = () => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    const option = {
      title: {
        text: '调度性能趋势'
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['匹配数量', '平均优势值', '计算时间(ms)']
      },
      xAxis: {
        type: 'category',
        data: []
      },
      yAxis: [
        {
          type: 'value',
          name: '数量/优势值',
          position: 'left'
        },
        {
          type: 'value',
          name: '时间(ms)',
          position: 'right'
        }
      ],
      series: [
        {
          name: '匹配数量',
          type: 'bar',
          data: []
        },
        {
          name: '平均优势值',
          type: 'line',
          data: []
        },
        {
          name: '计算时间(ms)',
          type: 'line',
          yAxisIndex: 1,
          data: []
        }
      ]
    }
    chart.setOption(option)
  }
}

const updateChart = (result) => {
  if (!chart) return
  
  const option = chart.getOption()
  const timeLabel = new Date().toLocaleTimeString()
  
  option.xAxis[0].data.push(timeLabel)
  if (option.xAxis[0].data.length > 20) {
    option.xAxis[0].data.shift()
  }
  
  option.series[0].data.push(result.drones_matched)
  if (option.series[0].data.length > 20) {
    option.series[0].data.shift()
  }
  
  option.series[1].data.push(result.total_advantage / (result.drones_matched || 1))
  if (option.series[1].data.length > 20) {
    option.series[1].data.shift()
  }
  
  option.series[2].data.push(result.computation_time * 1000)
  if (option.series[2].data.length > 20) {
    option.series[2].data.shift()
  }
  
  chart.setOption(option)
}

const initMap = async () => {
  const container = document.getElementById('map-container')
  if (!container) return

  try {
    await loadAmap()
    map = new AMap.Map('map-container', {
      zoom: 12,
      center: MAP_CENTER,
      mapStyle: 'amap://styles/normal'
    })
    updateMapMarkers()
  } catch (error) {
    console.error('高德地图加载失败:', error)
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;">地图加载失败，请检查网络连接和API配置</div>'
  }
}

const updateMapMarkers = () => {
  if (!map) return
  
  Object.values(droneMarkers).forEach(marker => marker.setMap(null))
  Object.values(nestMarkers).forEach(marker => marker.setMap(null))
  droneMarkers = {}
  nestMarkers = {}
  
  drones.value.forEach(drone => {
    const position = getDronePosition(drone)
    if (!position) {
      return
    }
    const marker = new AMap.Marker({
      position: position,
      title: `无人机 ${drone.drone_id || drone.id}`,
      content: `<div class="drone-marker ${drone.status}">🚁</div>`
    })
    marker.setMap(map)
    droneMarkers[drone.drone_id || drone.id] = marker
  })
  
  nests.value.forEach(nest => {
    const position = getNestPosition(nest)
    if (!position) {
      return
    }
    const marker = new AMap.Marker({
      position: position,
      title: `机槽 ${nest.nest_name || nest.name}`,
      content: `<div class="nest-marker ${nest.status}">🔋</div>`
    })
    marker.setMap(map)
    nestMarkers[nest.nest_id || nest.id] = marker
  })
}

const connectWebSocket = () => {
  wsConnection = websocketApi.connect(
    (data) => {
      const payload = data.payload || data.data
      if (data.type === 'update' && payload?.drones) {
        payload.drones.forEach(updatedDrone => {
          const index = drones.value.findIndex(d => d.drone_id === updatedDrone.drone_id)
          if (index !== -1) {
            drones.value[index] = { ...drones.value[index], ...updatedDrone }
          } else {
            drones.value.push(updatedDrone)
          }
        })
        updateMapMarkers()
      } else if (data.type === 'init' && payload?.nests) {
        nests.value = payload.nests
        updateMapMarkers()
      }
    },
    (error) => {
      console.error('WebSocket error:', error)
    }
  )
}

onMounted(() => {
  initChart()
  initMap()
  loadDrones()
  loadNests()
  loadSchedulerStatus()
  loadMetrics()
  connectWebSocket()
  
  statusTimer = setInterval(() => {
    loadSchedulerStatus()
    loadMetrics()
  }, 5000)
})

onUnmounted(() => {
  if (chart) {
    chart.dispose()
  }
  if (wsConnection) {
    wsConnection.close()
  }
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  if (map) {
    map.destroy()
  }
})
</script>

<style scoped>
.scheduling-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.map-container {
  height: 500px;
  width: 100%;
}

.drone-marker {
  font-size: 24px;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
}

.drone-marker.idle {
  opacity: 0.7;
}

.drone-marker.flying {
  animation: pulse 1s infinite;
}

.drone-marker.charging {
  color: #67c23a;
}

.drone-marker.emergency {
  color: #f56c6c;
  animation: pulse 0.5s infinite;
}

.nest-marker {
  font-size: 24px;
}

.nest-marker.available {
  color: #67c23a;
}

.nest-marker.full {
  color: #e6a23c;
}

.nest-marker.maintenance {
  color: #909399;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}
</style>
