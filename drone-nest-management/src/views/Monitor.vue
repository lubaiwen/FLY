<template>
  <div class="monitor-page">
    <div class="map-container" ref="mapContainer">
      <div v-if="mapLoading" class="map-loading">
        <el-icon class="loading-icon"><Loading /></el-icon>
        <span>地图加载中...</span>
      </div>
      <div v-if="mapError" class="map-error">
        <el-icon class="error-icon"><WarningFilled /></el-icon>
        <span>{{ mapError }}</span>
        <el-button type="primary" size="small" @click="retryLoadMap">重试</el-button>
      </div>
      
      <div class="search-bar">
        <el-input v-model="searchKeyword" placeholder="搜索无人机/机巢ID" prefix-icon="Search" clearable size="large" @keyup.enter="searchEntity">
          <template #append>
            <el-button @click="searchEntity" :disabled="!mapReady">
              <el-icon><Search /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>
      
      <div class="connection-status" :class="connectionStatus">
        <span class="status-dot"></span>
        <span>{{ connectionStatusText }}</span>
      </div>
      
      <div class="drone-count" v-if="realtimeStore.drones.length > 0">
        <el-icon><Position /></el-icon>
        <span>{{ realtimeStore.onlineDrones.length }}/{{ realtimeStore.drones.length }} 在线</span>
      </div>
    </div>
    
    <div class="control-panel" :class="{ 'panel-hidden': !panelVisible }">
      <div class="panel-content">
        <div class="panel-section">
          <h4>地图控制</h4>
          <div class="control-buttons">
            <el-button-group>
              <el-button size="small" @click="zoomIn" :disabled="!mapReady">
                <el-icon><Plus /></el-icon>
              </el-button>
              <el-button size="small" @click="zoomOut" :disabled="!mapReady">
                <el-icon><Minus /></el-icon>
              </el-button>
            </el-button-group>
            <el-button-group>
              <el-button size="small" :type="currentMapType === 'dark' ? 'primary' : ''" @click="setMapType('dark')" :disabled="!mapReady">暗色</el-button>
              <el-button size="small" :type="currentMapType === 'light' ? 'primary' : ''" @click="setMapType('light')" :disabled="!mapReady">亮色</el-button>
            </el-button-group>
          </div>
        </div>
        
        <div class="panel-section">
          <h4>3D视角</h4>
          <div class="control-buttons">
            <div class="slider-control">
              <span class="slider-label">倾斜角度</span>
              <el-slider v-model="pitchValue" :min="0" :max="80" :disabled="!mapReady" @change="updatePitch" />
            </div>
            <div class="slider-control">
              <span class="slider-label">旋转角度</span>
              <el-slider v-model="rotationValue" :min="0" :max="360" :disabled="!mapReady" @change="updateRotation" />
            </div>
            <el-button size="small" @click="resetView" :disabled="!mapReady">重置视角</el-button>
          </div>
        </div>
        
        <div class="panel-section">
          <h4>显示选项</h4>
          <div class="filter-options">
            <el-checkbox v-model="displayOptions.showDrones" @change="updateDisplay">无人机</el-checkbox>
            <el-checkbox v-model="displayOptions.showNests" @change="updateDisplay">机巢</el-checkbox>
            <el-checkbox v-model="displayOptions.showPlannedPaths" @change="updateDisplay">规划路径</el-checkbox>
          </div>
        </div>
        
        <div class="panel-section">
          <h4>无人机列表</h4>
          <div class="drone-list">
            <div class="drone-item" v-for="drone in realtimeStore.drones" :key="drone.drone_id" @click="selectDrone(drone)" :class="{ selected: selectedDrone?.drone_id === drone.drone_id, offline: !drone.signal?.connected }">
              <div class="drone-icon" :class="getDroneStatusClass(drone)">
                <el-icon><Position /></el-icon>
              </div>
              <div class="drone-info">
                <div class="drone-id">{{ drone.drone_id }}</div>
                <div class="drone-status">
                  <span class="battery" :class="getBatteryClass(drone.battery?.current)">
                    {{ drone.battery?.current?.toFixed(0) }}%
                  </span>
                  <span class="speed" v-if="drone.velocity?.speed > 0">
                    {{ drone.velocity.speed.toFixed(1) }} m/s
                  </span>
                </div>
              </div>
              <div class="signal-indicator" :class="{ connected: drone.signal?.connected }">
                <el-icon><Connection /></el-icon>
              </div>
            </div>
            <div v-if="realtimeStore.drones.length === 0" class="empty-list">
              暂无无人机数据
            </div>
          </div>
        </div>
        
        <div class="panel-section">
          <h4>无人机状态</h4>
          <div class="legend">
            <div class="legend-item"><span class="legend-color" style="background: #00e676; box-shadow: 0 0 6px #00e67640;"></span><span>空闲</span></div>
            <div class="legend-item"><span class="legend-color" style="background: #00d4ff; box-shadow: 0 0 6px #00d4ff40;"></span><span>飞行中</span></div>
            <div class="legend-item"><span class="legend-color" style="background: #ffab00; box-shadow: 0 0 6px #ffab0040;"></span><span>充电中</span></div>
            <div class="legend-item"><span class="legend-color" style="background: #ff5252; box-shadow: 0 0 6px #ff525240;"></span><span>故障/低电量</span></div>
            <div class="legend-item"><span class="legend-color" style="background: #607d8b; box-shadow: 0 0 6px #607d8b40;"></span><span>离线</span></div>
          </div>
        </div>
        
        <div class="panel-section">
          <h4>机巢状态</h4>
          <div class="legend">
            <div class="legend-item"><span class="legend-color nest-available"></span><span>可用</span></div>
            <div class="legend-item"><span class="legend-color nest-occupied"></span><span>占用</span></div>
            <div class="legend-item"><span class="legend-color nest-fault"></span><span>故障</span></div>
            <div class="legend-item"><span class="legend-color nest-offline"></span><span>离线</span></div>
          </div>
        </div>
        
        <div class="panel-section">
          <h4>其他</h4>
          <div class="legend">
            <div class="legend-item"><span class="legend-color planned"></span><span>规划路径</span></div>
          </div>
        </div>
      </div>
    </div>
    
    <button class="panel-toggle-btn" :class="{ 'btn-collapsed': !panelVisible }" @click="togglePanel">
      <el-icon><ArrowRight v-if="!panelVisible" /><ArrowLeft v-else /></el-icon>
    </button>
    
    <el-drawer v-model="showDroneDrawer" :title="selectedDrone?.drone_id" size="450px" direction="rtl">
      <div class="drone-detail-panel" v-if="selectedDrone">
        <div class="detail-header">
          <div class="drone-avatar" :class="getDroneStatusClass(selectedDrone)">
            <el-icon><Position /></el-icon>
          </div>
          <div class="drone-basic">
            <div class="drone-name">{{ selectedDrone.drone_id }}</div>
            <div class="drone-type">{{ getDroneTypeText(selectedDrone.drone_type) }}</div>
          </div>
          <div class="status-badge" :class="getDroneStatusClass(selectedDrone)">
            {{ getDroneStatusText(selectedDrone.status) }}
          </div>
        </div>
        
        <div class="detail-section">
          <h4>位置信息</h4>
          <div class="info-grid">
            <div class="info-item"><span class="label">经度</span><span class="value">{{ selectedDrone.position?.lng?.toFixed(6) }}</span></div>
            <div class="info-item"><span class="label">纬度</span><span class="value">{{ selectedDrone.position?.lat?.toFixed(6) }}</span></div>
            <div class="info-item"><span class="label">高度</span><span class="value">{{ selectedDrone.position?.altitude?.toFixed(1) }} m</span></div>
            <div class="info-item"><span class="label">航向</span><span class="value">{{ selectedDrone.velocity?.heading?.toFixed(0) }}°</span></div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>运动状态</h4>
          <div class="info-grid">
            <div class="info-item"><span class="label">速度</span><span class="value">{{ selectedDrone.velocity?.speed?.toFixed(1) || 0 }} m/s</span></div>
            <div class="info-item"><span class="label">垂直速度</span><span class="value">{{ selectedDrone.velocity?.vertical_speed?.toFixed(1) || 0 }} m/s</span></div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>电池状态</h4>
          <div class="battery-display">
            <el-progress :percentage="selectedDrone.battery?.current || 0" :stroke-width="12" :color="getBatteryColor(selectedDrone.battery?.current)" />
            <div class="battery-info">
              <span>{{ selectedDrone.battery?.current?.toFixed(1) }}%</span>
              <span>消耗率: {{ selectedDrone.battery?.consumption_rate?.toFixed(2) || 0 }}%/min</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>信号状态</h4>
          <div class="signal-display">
            <div class="signal-bars">
              <div class="bar" v-for="i in 5" :key="i" :class="{ active: getSignalLevel(selectedDrone.signal?.strength) >= i }"></div>
            </div>
            <span class="signal-value">{{ selectedDrone.signal?.strength?.toFixed(0) || 0 }}%</span>
            <span class="signal-status" :class="{ connected: selectedDrone.signal?.connected }">
              {{ selectedDrone.signal?.connected ? '已连接' : '已断开' }}
            </span>
          </div>
        </div>
        
        <div class="detail-section" v-if="selectedDrone.task?.target_nest">
          <h4>任务信息</h4>
          <div class="task-info">
            <div class="task-target">
              <el-icon><OfficeBuilding /></el-icon>
              <span>目标机巢: {{ selectedDrone.task.target_nest }}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section" v-if="currentPlannedPath">
          <h4>当前规划路径</h4>
          <div class="current-path-info">
            <div class="path-detail">
              <div class="detail-row">
                <span class="detail-label">目标机巢</span>
                <span class="detail-value">{{ currentPlannedPath.nest_id }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">路径类型</span>
                <span class="detail-value">{{ getPathTypeText(currentPlannedPath.path_type) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">总距离</span>
                <span class="detail-value highlight">{{ currentPlannedPath.total_distance?.toFixed(0) }} m</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">预计时间</span>
                <span class="detail-value highlight">{{ currentPlannedPath.estimated_duration?.toFixed(0) }} s</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">航向角</span>
                <span class="detail-value">{{ currentPlannedPath.bearing?.toFixed(0) }}°</span>
              </div>
            </div>
            <div class="waypoints-preview">
              <div class="waypoint-item" v-for="(wp, idx) in currentPlannedPath.waypoints?.slice(0, 5)" :key="idx">
                <div class="waypoint-index">{{ idx + 1 }}</div>
                <div class="waypoint-coords">
                  {{ wp.position.lat.toFixed(4) }}, {{ wp.position.lng.toFixed(4) }}
                </div>
              </div>
              <div class="waypoints-more" v-if="currentPlannedPath.waypoints?.length > 5">
                还有 {{ currentPlannedPath.waypoints.length - 5 }} 个节点...
              </div>
            </div>
          </div>
        </div>
        
        <div class="detail-actions">
          <el-button type="primary" @click="centerOnDrone" :disabled="!selectedDrone.signal?.connected">
            <el-icon><Aim /></el-icon>居中跟踪
          </el-button>
          <el-button type="success" @click="openPathPlanning" :disabled="!selectedDrone.signal?.connected">
            <el-icon><Route /></el-icon>规划路径
          </el-button>
          <el-button v-if="currentPlannedPath" type="danger" @click="clearCurrentPath">
            <el-icon><Close /></el-icon>清除路径
          </el-button>
        </div>
      </div>
    </el-drawer>
    
    <el-drawer v-model="showPathDrawer" title="路径规划" size="550px" direction="rtl">
      <div class="path-planning-panel">
        <div class="intelligent-match-section">
          <div class="section-header">
            <h4><el-icon><MagicStick /></el-icon> 智能匹配</h4>
            <el-button type="primary" size="small" @click="runIntelligentMatch" :loading="planningLoading">
              一键智能匹配
            </el-button>
          </div>
          <p class="section-desc">自动为所有需要充电的无人机匹配最优机巢</p>
        </div>
        
        <el-divider />
        
        <div class="path-form">
          <h4><el-icon><Position /></el-icon> 手动规划</h4>
          <el-form label-width="80px" size="small">
            <el-form-item label="无人机">
              <el-select v-model="pathPlanning.drone_id" placeholder="选择无人机" style="width: 100%" @change="fetchRecommendedNests">
                <el-option v-for="drone in realtimeStore.onlineDrones" :key="drone.drone_id" :label="drone.drone_id" :value="drone.drone_id">
                  <span>{{ drone.drone_id }}</span>
                  <span style="float: right; color: #8492a6; font-size: 12px">{{ drone.battery?.current?.toFixed(0) }}%</span>
                </el-option>
              </el-select>
            </el-form-item>
            
            <el-form-item label="推荐机巢" v-if="recommendedNests.length > 0">
              <div class="recommended-nests">
                <div 
                  class="nest-card" 
                  v-for="(nest, idx) in recommendedNests.slice(0, 3)" 
                  :key="nest.nest.nest_id"
                  :class="{ selected: pathPlanning.nest_id === nest.nest.nest_id }"
                  @click="selectRecommendedNest(nest)"
                >
                  <div class="nest-rank">{{ idx + 1 }}</div>
                  <div class="nest-info">
                    <div class="nest-name">{{ nest.nest.nest_name || nest.nest.nest_id }}</div>
                    <div class="nest-stats">
                      <span>距离: {{ nest.distance?.toFixed(0) }}m</span>
                      <span>评分: {{ nest.score?.toFixed(0) }}</span>
                    </div>
                    <div class="nest-battery">
                      预计到达电量: {{ nest.battery_after_arrival?.toFixed(1) }}%
                    </div>
                  </div>
                </div>
              </div>
            </el-form-item>
            
            <el-form-item label="目标机巢">
              <el-select v-model="pathPlanning.nest_id" placeholder="选择机巢" style="width: 100%">
                <el-option v-for="nest in availableNests" :key="nest.nest_id" :label="`${nest.nest_id} (${nest.nest_name || '可用'})`" :value="nest.nest_id" />
              </el-select>
            </el-form-item>
            <el-form-item label="路径类型">
              <el-radio-group v-model="pathPlanning.path_type">
                <el-radio label="straight">直线</el-radio>
                <el-radio label="polyline">折线</el-radio>
                <el-radio label="curve">曲线</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </div>
        
        <div class="path-result" v-if="plannedPath">
          <div class="result-header">
            <el-icon class="success-icon"><CircleCheck /></el-icon>
            <span>路径规划成功</span>
            <span class="efficiency-score">效率评分: {{ plannedPath.efficiency_score }}</span>
          </div>
          
          <div class="path-info">
            <div class="info-item">
              <el-icon><Aim /></el-icon>
              <div class="info-content">
                <span class="label">总距离</span>
                <span class="value">{{ plannedPath.total_distance?.toFixed(0) }} m</span>
              </div>
            </div>
            <div class="info-item">
              <el-icon><Timer /></el-icon>
              <div class="info-content">
                <span class="label">预计时间</span>
                <span class="value">{{ plannedPath.estimated_duration?.toFixed(0) }} s</span>
              </div>
            </div>
            <div class="info-item">
              <el-icon><Compass /></el-icon>
              <div class="info-content">
                <span class="label">航向角</span>
                <span class="value">{{ plannedPath.bearing?.toFixed(0) }}°</span>
              </div>
            </div>
            <div class="info-item">
              <el-icon><BatteryCharging /></el-icon>
              <div class="info-content">
                <span class="label">预计耗电</span>
                <span class="value warning">{{ plannedPath.battery_consumption?.toFixed(1) }}%</span>
              </div>
            </div>
          </div>
          
          <div class="waypoints-section">
            <h4>路径节点 ({{ plannedPath.waypoints?.length || 0 }}个)</h4>
            <div class="waypoints-list">
              <div class="waypoint-item" v-for="(wp, idx) in plannedPath.waypoints" :key="idx">
                <div class="waypoint-index">{{ wp.index || idx + 1 }}</div>
                <div class="waypoint-details">
                  <div class="waypoint-coords">{{ wp.position.lat.toFixed(6) }}, {{ wp.position.lng.toFixed(6) }}</div>
                  <div class="waypoint-meta">
                    <span>距离: {{ wp.distance?.toFixed(0) || 0 }}m</span>
                    <span>时间: {{ wp.time?.toFixed(0) || 0 }}s</span>
                    <span v-if="wp.position.altitude">高度: {{ wp.position.altitude.toFixed(0) }}m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="path-actions">
          <el-button type="primary" @click="executePathPlanning" :loading="planningLoading">
            <el-icon><Route /></el-icon>规划路径
          </el-button>
          <el-button v-if="plannedPath" type="success" @click="applyPath">
            <el-icon><Check /></el-icon>应用路径
          </el-button>
          <el-button @click="clearPlannedPath">清除</el-button>
        </div>
      </div>
    </el-drawer>
    
    <el-drawer v-model="showIntelligentMatch" title="智能匹配结果" size="600px" direction="rtl">
      <div class="intelligent-match-panel" v-if="intelligentMatchResult">
        <div class="match-summary">
          <div class="summary-item">
            <div class="summary-value">{{ intelligentMatchResult.summary.total_assignments }}</div>
            <div class="summary-label">匹配数量</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">{{ intelligentMatchResult.summary.total_distance?.toFixed(0) }}m</div>
            <div class="summary-label">总距离</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">{{ intelligentMatchResult.summary.total_battery_consumption?.toFixed(1) }}%</div>
            <div class="summary-label">总耗电</div>
          </div>
          <div class="summary-item">
            <div class="summary-value highlight">{{ intelligentMatchResult.summary.efficiency_score }}</div>
            <div class="summary-label">效率评分</div>
          </div>
        </div>
        
        <div class="match-list">
          <div class="match-item" v-for="assignment in intelligentMatchResult.assignments" :key="assignment.drone_id">
            <div class="match-drone">
              <el-icon><Position /></el-icon>
              <span>{{ assignment.drone_id }}</span>
            </div>
            <el-icon class="match-arrow"><Right /></el-icon>
            <div class="match-nest">
              <el-icon><OfficeBuilding /></el-icon>
              <span>{{ assignment.nest_name }}</span>
            </div>
            <div class="match-details">
              <span>距离: {{ assignment.distance?.toFixed(0) }}m</span>
              <span>耗电: {{ assignment.estimated_battery_consumption?.toFixed(1) }}%</span>
              <span>到达电量: {{ assignment.battery_after_arrival?.toFixed(1) }}%</span>
            </div>
          </div>
        </div>
        
        <div class="match-actions">
          <el-button type="primary" size="large" @click="applyIntelligentMatch">
            <el-icon><Check /></el-icon>应用所有匹配
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useNestStore } from '@/store/nest'
import { useRealtimeStore } from '@/store/realtime'
import { pathApi } from '@/api/path'

const nestStore = useNestStore()
const realtimeStore = useRealtimeStore()

const mapContainer = ref(null)
const searchKeyword = ref('')
const currentMapType = ref('dark')
const showDroneDrawer = ref(false)
const showPathDrawer = ref(false)
const selectedDrone = ref(null)
const mapLoading = ref(true)
const mapError = ref('')
const mapReady = ref(false)
const pitchValue = ref(45)
const rotationValue = ref(0)
const panelVisible = ref(true)
const trackingDrone = ref(null)
const plannedPath = ref(null)
const currentPlannedPath = ref(null)
const planningLoading = ref(false)
const intelligentMatchResult = ref(null)
const recommendedNests = ref([])
const showIntelligentMatch = ref(false)

const connectionStatus = computed(() => realtimeStore.connectionStatus)
const connectionStatusText = computed(() => {
  const texts = { connected: '已连接', disconnected: '已断开', connecting: '连接中', error: '连接错误' }
  return texts[connectionStatus.value] || '未知'
})

const displayOptions = reactive({
  showDrones: true,
  showNests: true,
  showPlannedPaths: true
})

const pathPlanning = reactive({
  drone_id: '',
  nest_id: '',
  path_type: 'straight'
})

const availableNests = computed(() => nestStore.nests.filter(n => n.status === 1))

let map = null
let droneMarkers = new Map()
let nestMarkers = []
let plannedPathPolyline = null
let waypointMarkers = []
let animationFrameId = null

const togglePanel = () => { panelVisible.value = !panelVisible.value }

const getDroneStatusClass = (drone) => {
  if (!drone.signal?.connected) return 'offline'
  const classes = { 0: 'idle', 1: 'flying', 2: 'charging' }
  return classes[drone.status] || 'idle'
}

const getDroneStatusText = (status) => {
  const texts = { 0: '空闲', 1: '飞行中', 2: '充电中' }
  return texts[status] || '未知'
}

const getDroneTypeText = (type) => {
  const texts = { 1: '固定路线', 2: '周期性', 3: '临时性' }
  return texts[type] || '未知'
}

const getPathTypeText = (type) => {
  const texts = { straight: '直线', polyline: '折线', curve: '曲线' }
  return texts[type] || '未知'
}

const getBatteryClass = (battery) => {
  if (battery < 20) return 'low'
  if (battery < 50) return 'medium'
  return 'high'
}

const getBatteryColor = (battery) => {
  if (battery < 20) return '#ff5252'
  if (battery < 50) return '#ffab00'
  return '#00e676'
}

const getSignalLevel = (strength) => Math.ceil((strength || 0) / 20)

const initMap = () => {
  mapLoading.value = true
  mapError.value = ''
  
  if (!mapContainer.value || !window.AMap) {
    mapLoading.value = false
    mapError.value = !window.AMap ? '高德地图API未加载' : '地图容器未找到'
    return
  }
  
  try {
    map = new AMap.Map(mapContainer.value, {
      zoom: 14,
      center: [117.260, 31.780],
      mapStyle: 'amap://styles/dark',
      viewMode: '3D',
      pitch: 45,
      rotation: 0,
      resizeEnable: true
    })
    
    map.on('complete', () => {
      mapLoading.value = false
      mapReady.value = true
      currentZoom.value = map.getZoom()
      ElMessage.success('地图加载成功')
      createNestMarkers()
      startRenderLoop()
    })
    
    map.on('zoomend', () => {
      const newZoom = map.getZoom()
      const oldZoom = currentZoom.value
      currentZoom.value = newZoom
      
      if (Math.abs(newZoom - oldZoom) >= 1) {
        updateAllMarkers()
      }
    })
    
    map.on('error', (e) => {
      mapLoading.value = false
      mapError.value = '地图加载失败: ' + (e.message || '未知错误')
    })
  } catch (error) {
    mapLoading.value = false
    mapError.value = '地图初始化失败: ' + error.message
  }
}

const currentZoom = ref(13)
const markerScale = computed(() => {
  const zoom = currentZoom.value
  if (zoom >= 16) return 1.4
  if (zoom >= 14) return 1.2
  if (zoom >= 12) return 1.0
  if (zoom >= 10) return 0.85
  return 0.7
})

const DRONE_STATUS_CONFIG = {
  0: { color: '#00e676', bgColor: 'rgba(0, 230, 118, 0.2)', label: '空闲', icon: 'idle' },
  1: { color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.2)', label: '飞行中', icon: 'flying' },
  2: { color: '#ffab00', bgColor: 'rgba(255, 171, 0, 0.2)', label: '充电中', icon: 'charging' },
  3: { color: '#ff5252', bgColor: 'rgba(255, 82, 82, 0.2)', label: '故障', icon: 'error' }
}

const NEST_STATUS_CONFIG = {
  0: { color: '#78909c', bgColor: 'rgba(120, 144, 156, 0.2)', label: '离线', pattern: 'diagonal' },
  1: { color: '#00e676', bgColor: 'rgba(0, 230, 118, 0.15)', label: '可用', pattern: 'solid' },
  2: { color: '#ff9800', bgColor: 'rgba(255, 152, 0, 0.15)', label: '占用', pattern: 'striped' },
  3: { color: '#f44336', bgColor: 'rgba(244, 67, 54, 0.15)', label: '故障', pattern: 'crossed' }
}

const createDroneMarkerContent = (drone) => {
  const scale = markerScale.value
  const baseSize = 32 * scale
  const iconSize = 16 * scale
  const heading = drone.velocity?.heading || 0
  const battery = drone.battery?.current || 0
  
  let statusConfig
  if (!drone.signal?.connected) {
    statusConfig = { color: '#607d8b', bgColor: 'rgba(96, 125, 139, 0.2)', label: '离线' }
  } else if (battery < 20) {
    statusConfig = { color: '#ff5252', bgColor: 'rgba(255, 82, 82, 0.25)', label: '低电量' }
  } else {
    statusConfig = DRONE_STATUS_CONFIG[drone.status] || DRONE_STATUS_CONFIG[0]
  }
  
  const showBatteryWarning = drone.signal?.connected && battery < 30
  const batteryColor = battery < 20 ? '#ff5252' : battery < 30 ? '#ff9800' : '#4caf50'
  
  return `
    <div class="drone-marker" style="
      width: ${baseSize}px;
      height: ${baseSize}px;
      position: relative;
      cursor: pointer;
    ">
      <div class="drone-body" style="
        width: 100%;
        height: 100%;
        background: ${statusConfig.bgColor};
        border: 2px solid ${statusConfig.color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: rotate(${heading}deg);
        transition: all 0.3s ease;
        box-shadow: 0 0 ${8 * scale}px ${statusConfig.color}40;
      ">
        <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="${statusConfig.color}">
          <path d="M12 2L4 12l8 10 8-10L12 2z"/>
        </svg>
      </div>
      ${!drone.signal?.connected ? `
        <div style="
          position: absolute;
          top: -${4 * scale}px;
          right: -${4 * scale}px;
          width: ${10 * scale}px;
          height: ${10 * scale}px;
          background: #607d8b;
          border-radius: 50%;
          border: 2px solid #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg viewBox="0 0 24 24" width="${6 * scale}px" height="${6 * scale}px" fill="#fff">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" opacity="0"/>
            <path d="M15.5 14h-7l3.5-4z" transform="rotate(180 12 12)"/>
          </svg>
        </div>
      ` : ''}
      ${showBatteryWarning ? `
        <div style="
          position: absolute;
          bottom: -${6 * scale}px;
          left: 50%;
          transform: translateX(-50%);
          background: ${batteryColor};
          color: #fff;
          font-size: ${9 * scale}px;
          font-weight: bold;
          padding: 1px ${4 * scale}px;
          border-radius: ${4 * scale}px;
          white-space: nowrap;
        ">${Math.round(battery)}%</div>
      ` : ''}
    </div>
  `
}

const createNestMarkerContent = (nest) => {
  const scale = markerScale.value
  const baseSize = 36 * scale
  const iconSize = 20 * scale
  const statusConfig = NEST_STATUS_CONFIG[nest.status] || NEST_STATUS_CONFIG[0]
  
  const patternStyle = statusConfig.pattern === 'diagonal' 
    ? `repeating-linear-gradient(45deg, transparent, transparent 3px, ${statusConfig.color}20 3px, ${statusConfig.color}20 6px)`
    : statusConfig.pattern === 'striped'
    ? `repeating-linear-gradient(90deg, transparent, transparent 4px, ${statusConfig.color}30 4px, ${statusConfig.color}30 8px)`
    : statusConfig.pattern === 'crossed'
    ? `repeating-linear-gradient(45deg, transparent, transparent 3px, ${statusConfig.color}20 3px, ${statusConfig.color}20 6px), repeating-linear-gradient(-45deg, transparent, transparent 3px, ${statusConfig.color}20 3px, ${statusConfig.color}20 6px)`
    : 'transparent'
  
  const availableSlots = nest.available_slots || 0
  const showSlots = nest.status === 1 && availableSlots > 0
  
  return `
    <div class="nest-marker" style="
      width: ${baseSize}px;
      height: ${baseSize}px;
      position: relative;
      cursor: pointer;
    ">
      <div style="
        width: 100%;
        height: 100%;
        background: ${statusConfig.bgColor};
        border: 2.5px solid ${statusConfig.color};
        border-radius: ${8 * scale}px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 ${10 * scale}px ${statusConfig.color}30;
        position: relative;
        overflow: hidden;
      ">
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: ${patternStyle};
          pointer-events: none;
        "></div>
        <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="${statusConfig.color}" style="position: relative; z-index: 1;">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
      ${showSlots ? `
        <div style="
          position: absolute;
          top: -${8 * scale}px;
          right: -${4 * scale}px;
          background: #00e676;
          color: #0a1628;
          font-size: ${10 * scale}px;
          font-weight: bold;
          min-width: ${16 * scale}px;
          height: ${16 * scale}px;
          border-radius: ${8 * scale}px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 ${4 * scale}px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">${availableSlots}</div>
      ` : ''}
      ${nest.status === 3 ? `
        <div style="
          position: absolute;
          top: -${4 * scale}px;
          right: -${4 * scale}px;
          width: ${12 * scale}px;
          height: ${12 * scale}px;
          background: #f44336;
          border-radius: 50%;
          border: 2px solid #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span style="color: #fff; font-size: ${8 * scale}px; font-weight: bold;">!</span>
        </div>
      ` : ''}
    </div>
  `
}

const createNestMarkers = () => {
  if (!map || !mapReady.value) return
  
  nestMarkers.forEach(m => map.remove(m))
  nestMarkers = []
  
  if (!displayOptions.showNests) return
  
  nestStore.nests.forEach(nest => {
    const position = [parseFloat(nest.longitude) || 117.260, parseFloat(nest.latitude) || 31.780]
    
    const marker = new AMap.Marker({
      position,
      content: createNestMarkerContent(nest),
      offset: new AMap.Pixel(-18, -18),
      extData: { type: 'nest', data: nest }
    })
    
    marker.on('click', () => {
      pathPlanning.nest_id = nest.nest_id
      showPathDrawer.value = true
    })
    
    nestMarkers.push(marker)
    map.add(marker)
  })
}

const updateAllMarkers = () => {
  createNestMarkers()
  droneMarkers.forEach((marker, droneId) => {
    const drone = realtimeStore.getDroneById(droneId)
    if (drone) {
      marker.setContent(createDroneMarkerContent(drone))
    }
  })
}

const updateDroneMarkers = () => {
  if (!map || !mapReady.value) return
  
  if (!displayOptions.showDrones) {
    droneMarkers.forEach((marker) => map.remove(marker))
    droneMarkers.clear()
    return
  }
  
  const currentDroneIds = new Set()
  
  realtimeStore.drones.forEach(drone => {
    currentDroneIds.add(drone.drone_id)
    const position = [drone.position.lng, drone.position.lat]
    
    if (droneMarkers.has(drone.drone_id)) {
      const marker = droneMarkers.get(drone.drone_id)
      marker.setPosition(position)
      marker.setExtData({ type: 'drone', data: drone })
    } else {
      const marker = new AMap.Marker({
        position,
        content: createDroneMarkerContent(drone),
        offset: new AMap.Pixel(-16, -16),
        extData: { type: 'drone', data: drone }
      })
      
      marker.on('click', () => selectDrone(drone))
      
      droneMarkers.set(drone.drone_id, marker)
      map.add(marker)
    }
  })
  
  droneMarkers.forEach((marker, droneId) => {
    if (!currentDroneIds.has(droneId)) {
      map.remove(marker)
      droneMarkers.delete(droneId)
    }
  })
}

const drawPlannedPath = () => {
  if (!map || !mapReady.value) return
  
  if (plannedPathPolyline) {
    map.remove(plannedPathPolyline)
    plannedPathPolyline = null
  }
  
  waypointMarkers.forEach(m => map.remove(m))
  waypointMarkers = []
  
  const pathToShow = currentPlannedPath.value || plannedPath.value
  
  if (!pathToShow || !displayOptions.showPlannedPaths) return
  
  const path = pathToShow.waypoints.map(w => [w.position.lng, w.position.lat])
  
  plannedPathPolyline = new AMap.Polyline({
    path,
    strokeColor: '#ff6b35',
    strokeWeight: 4,
    strokeOpacity: 0.9,
    strokeStyle: 'dashed',
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: 20
  })
  
  map.add(plannedPathPolyline)
  
  if (pathToShow.waypoints && pathToShow.waypoints.length > 0) {
    const startWp = pathToShow.waypoints[0]
    const endWp = pathToShow.waypoints[pathToShow.waypoints.length - 1]
    
    const startMarker = new AMap.Marker({
      position: [startWp.position.lng, startWp.position.lat],
      content: `<div style="width: 16px; height: 16px; background: #00e676; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 8px rgba(0,230,118,0.6);"></div>`,
      offset: new AMap.Pixel(-8, -8),
      zIndex: 25
    })
    
    const endMarker = new AMap.Marker({
      position: [endWp.position.lng, endWp.position.lat],
      content: `<div style="width: 16px; height: 16px; background: #ff6b35; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 8px rgba(255,107,53,0.6);"></div>`,
      offset: new AMap.Pixel(-8, -8),
      zIndex: 25
    })
    
    waypointMarkers.push(startMarker, endMarker)
    map.add(startMarker)
    map.add(endMarker)
  }
}

let lastUpdateTime = 0
const UPDATE_INTERVAL = 1000

const startRenderLoop = () => {
  const render = (timestamp) => {
    if (timestamp - lastUpdateTime >= UPDATE_INTERVAL) {
      lastUpdateTime = timestamp
      updateDroneMarkers()
    }
    
    if (trackingDrone.value) {
      const drone = realtimeStore.getDroneById(trackingDrone.value)
      if (drone && map) {
        map.setCenter([drone.position.lng, drone.position.lat])
      }
    }
    
    animationFrameId = requestAnimationFrame(render)
  }
  
  render(0)
}

const stopRenderLoop = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

const selectDrone = (drone) => {
  selectedDrone.value = drone
  showDroneDrawer.value = true
  
  if (realtimeStore.plannedPaths.has(drone.drone_id)) {
    currentPlannedPath.value = realtimeStore.plannedPaths.get(drone.drone_id)
  }
}

const centerOnDrone = () => {
  if (selectedDrone.value && map) {
    trackingDrone.value = selectedDrone.value.drone_id
    map.setCenter([selectedDrone.value.position.lng, selectedDrone.value.position.lat])
    map.setZoom(16)
  }
}

const openPathPlanning = () => {
  if (selectedDrone.value) {
    pathPlanning.drone_id = selectedDrone.value.drone_id
    const nearestNest = availableNests.value[0]
    if (nearestNest) {
      pathPlanning.nest_id = nearestNest.nest_id
    }
    showPathDrawer.value = true
  }
}

const executePathPlanning = async () => {
  if (!pathPlanning.drone_id || !pathPlanning.nest_id) {
    ElMessage.warning('请选择无人机和目标机巢')
    return
  }
  
  const drone = realtimeStore.getDroneById(pathPlanning.drone_id)
  if (!drone) {
    ElMessage.error('无法获取无人机信息')
    return
  }
  
  planningLoading.value = true
  try {
    const requestData = {
      ...pathPlanning,
      start_position: {
        lat: drone.position.lat,
        lng: drone.position.lng,
        altitude: drone.position.altitude
      }
    }
    const res = await pathApi.plan(requestData)
    if (res.code === 200) {
      plannedPath.value = res.data
      drawPlannedPath()
      ElMessage.success('路径规划成功')
    }
  } catch (error) {
    ElMessage.error('路径规划失败: ' + error.message)
  } finally {
    planningLoading.value = false
  }
}

const applyPath = () => {
  if (plannedPath.value) {
    currentPlannedPath.value = plannedPath.value
    realtimeStore.setPlannedPath(pathPlanning.drone_id, plannedPath.value)
    drawPlannedPath()
    showPathDrawer.value = false
    ElMessage.success('路径已应用')
  }
}

const fetchRecommendedNests = async () => {
  if (!pathPlanning.drone_id) return
  
  try {
    const res = await pathApi.getBestNest(pathPlanning.drone_id)
    if (res.code === 200) {
      recommendedNests.value = res.data.recommended_nests || []
    }
  } catch (error) {
    console.error('获取推荐机巢失败:', error)
  }
}

const runIntelligentMatch = async () => {
  planningLoading.value = true
  try {
    const res = await pathApi.intelligentMatch({})
    if (res.code === 200) {
      intelligentMatchResult.value = res.data
      showIntelligentMatch.value = true
      ElMessage.success(`智能匹配完成，共匹配 ${res.data.summary.total_assignments} 架无人机`)
    }
  } catch (error) {
    ElMessage.error('智能匹配失败: ' + error.message)
  } finally {
    planningLoading.value = false
  }
}

const selectRecommendedNest = (nest) => {
  pathPlanning.nest_id = nest.nest.nest_id
}

const applyIntelligentMatch = () => {
  if (intelligentMatchResult.value?.assignments) {
    intelligentMatchResult.value.assignments.forEach(assignment => {
      realtimeStore.setPlannedPath(assignment.drone_id, assignment.path)
    })
    showIntelligentMatch.value = false
    ElMessage.success('智能匹配结果已应用')
  }
}

const clearPlannedPath = () => {
  if (plannedPathPolyline && map) {
    map.remove(plannedPathPolyline)
    plannedPathPolyline = null
  }
  
  waypointMarkers.forEach(m => map.remove(m))
  waypointMarkers = []
  
  plannedPath.value = null
}

const clearCurrentPath = () => {
  if (plannedPathPolyline && map) {
    map.remove(plannedPathPolyline)
    plannedPathPolyline = null
  }
  
  waypointMarkers.forEach(m => map.remove(m))
  waypointMarkers = []
  
  currentPlannedPath.value = null
  realtimeStore.clearPlannedPath(selectedDrone.value?.drone_id)
  ElMessage.success('已清除当前路径')
}

const updateDisplay = () => {
  updateDroneMarkers()
  createNestMarkers()
  drawPlannedPath()
}

const zoomIn = () => map?.zoomIn()
const zoomOut = () => map?.zoomOut()

const setMapType = (type) => {
  currentMapType.value = type
  map?.setMapStyle(type === 'light' ? 'amap://styles/normal' : 'amap://styles/dark')
}

const updatePitch = (value) => map?.setPitch(value, true, 500)
const updateRotation = (value) => map?.setRotation(value, true, 500)

const resetView = () => {
  pitchValue.value = 45
  rotationValue.value = 0
  trackingDrone.value = null
  map?.setPitch(45, true, 500)
  map?.setRotation(0, true, 500)
  map?.setZoomAndCenter(14, [117.260, 31.780])
}

const searchEntity = () => {
  if (!searchKeyword.value || !map) return
  
  const drone = realtimeStore.drones.find(d => 
    d.drone_id.toLowerCase().includes(searchKeyword.value.toLowerCase())
  )
  
  if (drone) {
    map.setCenter([drone.position.lng, drone.position.lat])
    map.setZoom(16)
    selectDrone(drone)
    return
  }
  
  const nest = nestStore.nests.find(n =>
    n.nest_id.toLowerCase().includes(searchKeyword.value.toLowerCase())
  )
  
  if (nest) {
    map.setCenter([parseFloat(nest.longitude), parseFloat(nest.latitude)])
    map.setZoom(16)
    ElMessage.info(`已定位到机巢: ${nest.nest_id}`)
    return
  }
  
  ElMessage.warning('未找到匹配的无人机或机巢')
}

const retryLoadMap = () => initMap()

watch(() => realtimeStore.connectionStatus, (status) => {
  if (status === 'disconnected') {
    ElMessage.warning('WebSocket连接已断开，正在尝试重连...')
  } else if (status === 'connected') {
    ElMessage.success('WebSocket连接成功')
  }
})

watch(() => selectedDrone.value?.drone_id, (droneId) => {
  if (droneId) {
    pathPlanning.drone_id = droneId
    if (realtimeStore.plannedPaths.has(droneId)) {
      currentPlannedPath.value = realtimeStore.plannedPaths.get(droneId)
    } else {
      currentPlannedPath.value = null
    }
  }
})

onMounted(async () => {
  await nestStore.fetchNests()
  realtimeStore.connect()
  await nextTick()
  setTimeout(() => initMap(), 500)
})

watch(() => nestStore.nests, (newNests) => {
  if (newNests.length > 0 && mapReady.value) {
    createNestMarkers()
  }
}, { deep: true })

onUnmounted(() => {
  stopRenderLoop()
  realtimeStore.disconnect()
  if (map) {
    map.destroy()
    map = null
  }
  droneMarkers.clear()
  nestMarkers = []
  waypointMarkers = []
})
</script>

<style lang="scss" scoped>
.monitor-page {
  position: relative;
  height: calc(100vh - 64px);
  display: flex;
  overflow: hidden;
}

.map-container {
  flex: 1;
  position: relative;
  background: $bg-darker;
  width: 100%;
  height: 100%;
}

.map-loading, .map-error {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: $bg-darker;
  z-index: 10;
  gap: 12px;
  
  .loading-icon { font-size: 48px; color: $primary-color; animation: spin 1s linear infinite; }
  .error-icon { font-size: 48px; color: $danger-color; }
  span { color: $text-secondary; font-size: 14px; }
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.connection-status {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba($bg-card, 0.95);
  border-radius: 20px;
  font-size: 13px;
  z-index: 20;
  border: 1px solid $border-color;
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $text-muted;
  }
  
  &.connected { .status-dot { background: $success-color; } }
  &.disconnected, &.error { .status-dot { background: $danger-color; } }
  &.connecting { .status-dot { background: $warning-color; animation: pulse 1s infinite; } }
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.drone-count {
  position: absolute;
  top: 20px;
  right: 300px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba($bg-card, 0.95);
  border-radius: 20px;
  font-size: 13px;
  z-index: 20;
  border: 1px solid $border-color;
  color: $text-primary;
  
  .el-icon { color: $primary-color; }
}

.control-panel {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  background: $bg-card;
  border-left: 1px solid $border-color;
  overflow-y: auto;
  position: relative;
  transition: all 0.3s ease;
  
  &.panel-hidden {
    width: 0;
    min-width: 0;
    flex-shrink: 1;
    border: none;
    overflow: hidden;
    .panel-content { opacity: 0; visibility: hidden; }
  }
  
  .panel-content {
    padding: 20px;
    width: 280px;
    transition: opacity 0.3s ease, visibility 0.3s ease;
  }
  
  .panel-section {
    margin-bottom: 24px;
    h4 {
      font-size: 13px;
      font-weight: 600;
      color: $text-secondary;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }
  
  .control-buttons { display: flex; flex-direction: column; gap: 12px; }
  
  .slider-control {
    .slider-label { display: block; font-size: 12px; color: $text-secondary; margin-bottom: 8px; }
    :deep(.el-slider) {
      --el-slider-main-bg-color: #{$primary-color};
      --el-slider-runway-bg-color: rgba($primary-color, 0.2);
    }
  }
  
  .filter-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    :deep(.el-checkbox) { --el-checkbox-text-color: #{$text-secondary}; }
  }
  
  .drone-list {
    max-height: 300px;
    overflow-y: auto;
    
    .drone-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 8px;
      background: rgba($bg-darker, 0.5);
      
      &:hover { background: rgba($primary-color, 0.1); }
      &.selected { background: rgba($primary-color, 0.2); border: 1px solid $primary-color; }
      &.offline { opacity: 0.6; }
      
      .drone-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        
        &.flying { background: rgba($primary-color, 0.2); color: $primary-color; }
        &.idle { background: rgba($success-color, 0.2); color: $success-color; }
        &.charging { background: rgba($warning-color, 0.2); color: $warning-color; }
        &.offline { background: rgba($text-muted, 0.2); color: $text-muted; }
      }
      
      .drone-info {
        flex: 1;
        .drone-id { font-size: 13px; font-weight: 500; color: $text-primary; }
        .drone-status {
          display: flex;
          gap: 8px;
          font-size: 11px;
          .battery { &.low { color: $danger-color; } &.medium { color: $warning-color; } &.high { color: $success-color; } }
          .speed { color: $text-muted; }
        }
      }
      
      .signal-indicator {
        color: $text-muted;
        &.connected { color: $success-color; }
      }
    }
    
    .empty-list { text-align: center; padding: 20px; color: $text-muted; font-size: 13px; }
  }
  
  .legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: $text-secondary;
      
      .legend-color {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        flex-shrink: 0;
        
        &.nest-available { 
          background: #00e676; 
          border-radius: 4px;
          box-shadow: 0 0 6px rgba(0, 230, 118, 0.4);
        }
        &.nest-occupied { 
          background: #ff9800; 
          border-radius: 4px;
          background: repeating-linear-gradient(90deg, #ff9800, #ff9800 2px, transparent 2px, transparent 4px);
        }
        &.nest-fault { 
          background: #f44336; 
          border-radius: 4px;
          background: repeating-linear-gradient(45deg, #f44336, #f44336 1px, transparent 1px, transparent 3px), repeating-linear-gradient(-45deg, #f44336, #f44336 1px, transparent 1px, transparent 3px);
        }
        &.nest-offline { 
          background: #78909c; 
          border-radius: 4px;
          background: repeating-linear-gradient(45deg, #78909c, #78909c 1px, transparent 1px, transparent 3px);
        }
        &.planned { 
          background: #ff6b35; 
          border-radius: 2px;
          width: 20px;
          height: 3px;
        }
      }
    }
  }
}

.panel-toggle-btn {
  position: absolute;
  right: 280px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 56px;
  background: $bg-card;
  border: 1px solid $border-color;
  border-right: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
  transition: all 0.3s ease;
  z-index: 50;
  
  &.btn-collapsed { right: 0; border: 1px solid $border-color; border-radius: 8px 0 0 8px; }
  &:hover { background: $primary-color; color: #fff; border-color: $primary-color; }
  .el-icon { font-size: 16px; }
}

.search-bar {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: min(400px, calc(100% - 600px));
  max-width: 400px;
  min-width: 280px;
  z-index: 20;
  
  :deep(.el-input) {
    --el-input-bg-color: rgba($bg-card, 0.95);
    --el-input-border-color: #{$border-color};
    --el-input-text-color: #{$text-primary};
    .el-input__wrapper { border-radius: 24px; box-shadow: $shadow-md; }
  }
}

.drone-detail-panel {
  .detail-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    margin-bottom: 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    
    .drone-avatar {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      &.flying { background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.2); }
      &.idle { background: rgba(0, 230, 118, 0.15); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.2); }
      &.charging { background: rgba(255, 171, 0, 0.15); color: #ffab00; border: 1px solid rgba(255, 171, 0, 0.2); }
      &.offline { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); }
    }
    
    .drone-basic {
      flex: 1;
      .drone-name { font-size: 18px; font-weight: 600; color: #e8f4ff; }
      .drone-type { font-size: 13px; color: rgba(255, 255, 255, 0.5); }
    }
    
    .status-badge {
      padding: 6px 14px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      &.flying { background: rgba(0, 212, 255, 0.12); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.2); }
      &.idle { background: rgba(0, 230, 118, 0.12); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.2); }
      &.charging { background: rgba(255, 171, 0, 0.12); color: #ffab00; border: 1px solid rgba(255, 171, 0, 0.2); }
      &.offline { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); }
    }
  }
  
  .detail-section {
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    
    h4 { font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.5); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      
      .info-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        .label { font-size: 11px; color: rgba(255, 255, 255, 0.4); }
        .value { font-size: 14px; color: #e8f4ff; font-weight: 500; }
      }
    }
    
    .battery-display {
      .battery-info {
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
      }
    }
    
    .signal-display {
      display: flex;
      align-items: center;
      gap: 12px;
      
      .signal-bars {
        display: flex;
        gap: 3px;
        .bar {
          width: 4px;
          height: 12px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
          &.active { background: #00e676; }
          &:nth-child(2) { height: 16px; }
          &:nth-child(3) { height: 20px; }
          &:nth-child(4) { height: 24px; }
          &:nth-child(5) { height: 28px; }
        }
      }
      
      .signal-value { font-size: 14px; font-weight: 500; color: #e8f4ff; }
      .signal-status {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
        &.connected { color: #00e676; }
      }
    }
    
    .task-info {
      .task-target {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        background: rgba(0, 212, 255, 0.08);
        border-radius: 8px;
        color: #00d4ff;
        border: 1px solid rgba(0, 212, 255, 0.15);
      }
    }
    
    .current-path-info {
      .path-detail {
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          
          .detail-label { font-size: 12px; color: rgba(255, 255, 255, 0.5); }
          .detail-value { 
            font-size: 13px; 
            color: #e8f4ff; 
            font-weight: 500;
            &.highlight { color: #ff6b35; font-weight: 600; }
          }
        }
      }
      
      .waypoints-preview {
        margin-top: 12px;
        max-height: 120px;
        overflow-y: auto;
        
        .waypoint-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          
          .waypoint-index {
            width: 20px;
            height: 20px;
            background: rgba(255, 107, 53, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ff6b35;
            font-size: 10px;
          }
        }
        
        .waypoints-more {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
          text-align: center;
          padding: 8px;
        }
      }
    }
  }
  
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}

.path-planning-panel {
  .intelligent-match-section {
    margin-bottom: 16px;
    
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      
      h4 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: #e8f4ff;
        margin: 0;
        
        .el-icon {
          color: #00d4ff;
        }
      }
    }
    
    .section-desc {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin: 0;
    }
  }
  
  .path-form {
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    
    h4 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #e8f4ff;
      margin: 0 0 16px 0;
      
      .el-icon {
        color: #ff6b35;
      }
    }
  }
  
  .recommended-nests {
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    .nest-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(0, 212, 255, 0.3);
      }
      
      &.selected {
        background: rgba(0, 212, 255, 0.1);
        border-color: #00d4ff;
      }
      
      .nest-rank {
        width: 28px;
        height: 28px;
        background: linear-gradient(135deg, #00d4ff, #00e676);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 700;
        color: #0a1628;
        flex-shrink: 0;
      }
      
      .nest-info {
        flex: 1;
        
        .nest-name {
          font-size: 13px;
          font-weight: 600;
          color: #e8f4ff;
          margin-bottom: 4px;
        }
        
        .nest-stats {
          display: flex;
          gap: 12px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 4px;
        }
        
        .nest-battery {
          font-size: 11px;
          color: #00e676;
        }
      }
    }
  }
  
  .path-result {
    margin-bottom: 20px;
    
    .result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px;
      background: rgba(0, 230, 118, 0.08);
      border-radius: 12px;
      margin-bottom: 16px;
      
      .success-icon {
        font-size: 24px;
        color: #00e676;
      }
      
      span {
        font-size: 16px;
        font-weight: 600;
        color: #00e676;
      }
      
      .efficiency-score {
        margin-left: auto;
        font-size: 14px;
        color: #00d4ff;
        background: rgba(0, 212, 255, 0.15);
        padding: 4px 12px;
        border-radius: 12px;
      }
    }
    
    .path-info {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 20px;
      
      .info-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        
        .el-icon {
          font-size: 20px;
          color: #00d4ff;
        }
        
        .info-content {
          .label {
            display: block;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 2px;
          }
          
          .value {
            font-size: 16px;
            font-weight: 600;
            color: #e8f4ff;
            
            &.warning {
              color: #ffab00;
            }
          }
        }
      }
    }
    
    .waypoints-section {
      h4 {
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .waypoints-list {
        max-height: 200px;
        overflow-y: auto;
        
        .waypoint-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px;
          margin-bottom: 6px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          
          .waypoint-index {
            width: 22px;
            height: 22px;
            background: rgba(255, 107, 53, 0.15);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ff6b35;
            font-size: 11px;
            font-weight: 600;
            flex-shrink: 0;
          }
          
          .waypoint-details {
            flex: 1;
            
            .waypoint-coords {
              font-size: 11px;
              color: #e8f4ff;
              font-family: monospace;
              margin-bottom: 4px;
            }
            
            .waypoint-meta {
              display: flex;
              gap: 10px;
              font-size: 10px;
              color: rgba(255, 255, 255, 0.4);
            }
          }
        }
      }
    }
  }
  
  .path-actions {
    display: flex;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}

.intelligent-match-panel {
  .match-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
    
    .summary-item {
      text-align: center;
      padding: 20px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      
      .summary-value {
        font-size: 28px;
        font-weight: 700;
        color: #e8f4ff;
        margin-bottom: 8px;
        
        &.highlight {
          color: #00d4ff;
          background: linear-gradient(135deg, #00d4ff, #00e676);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      }
      
      .summary-label {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }
  }
  
  .match-list {
    max-height: 400px;
    overflow-y: auto;
    margin-bottom: 24px;
    
    .match-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      margin-bottom: 12px;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      
      .match-drone, .match-nest {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
      }
      
      .match-drone {
        background: rgba(0, 212, 255, 0.1);
        color: #00d4ff;
      }
      
      .match-nest {
        background: rgba(0, 230, 118, 0.1);
        color: #00e676;
      }
      
      .match-arrow {
        color: rgba(255, 255, 255, 0.3);
        font-size: 18px;
      }
      
      .match-details {
        margin-left: auto;
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }
  
  .match-actions {
    display: flex;
    justify-content: center;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}

@media screen and (max-width: $breakpoint-md) {
  .control-panel {
    position: fixed;
    right: 0;
    top: 64px;
    height: calc(100vh - 64px);
    z-index: 1000;
  }
  
  .panel-toggle-btn { right: 280px; &.btn-collapsed { right: 0; } }
  .search-bar { width: calc(100% - 40px); min-width: auto; }
  .drone-count { right: 300px; }
}

:deep(.el-drawer) {
  .el-drawer__header {
    margin-bottom: 0;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 22, 40, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    position: relative;
    z-index: 1;
    
    .el-drawer__title {
      font-size: 16px;
      font-weight: 600;
      color: #e8f4ff;
    }
    
    .el-drawer__close-btn {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.6);
      transition: all 0.2s;
      z-index: 100;
      pointer-events: auto !important;
      cursor: pointer !important;
      border: 1px solid rgba(255, 255, 255, 0.08);
      
      &:hover {
        background: rgba(255, 82, 82, 0.15);
        color: #ff5252;
        border-color: rgba(255, 82, 82, 0.3);
      }
      
      .el-icon {
        font-size: 16px;
        pointer-events: none;
      }
      
      svg {
        pointer-events: none;
      }
    }
  }
  
  .el-drawer__body {
    padding: 20px;
    background: rgba(10, 22, 40, 0.75);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
}
</style>
