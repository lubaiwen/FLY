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

      <!-- 地图控制按钮组 -->
      <div class="map-controls">
        <el-button-group>
          <el-button size="small" @click="zoomIn" :disabled="!mapReady">
            <el-icon><Plus /></el-icon>
          </el-button>
          <el-button size="small" @click="zoomOut" :disabled="!mapReady">
            <el-icon><Minus /></el-icon>
          </el-button>
        </el-button-group>
        <el-button size="small" @click="resetView" :disabled="!mapReady">
          <el-icon><Aim /></el-icon>
        </el-button>
        <el-button-group>
          <el-button size="small" :type="currentMapType === 'dark' ? 'primary' : ''" @click="setMapType('dark')" :disabled="!mapReady">暗色</el-button>
          <el-button size="small" :type="currentMapType === 'light' ? 'primary' : ''" @click="setMapType('light')" :disabled="!mapReady">亮色</el-button>
          <el-button size="small" :type="currentMapType === 'satellite' ? 'primary' : ''" @click="setMapType('satellite')" :disabled="!mapReady">卫星</el-button>
        </el-button-group>
      </div>
    </div>

    <div class="control-panel" :class="{ 'panel-hidden': !panelVisible }">
      <div class="panel-content">
        <div class="panel-section">
          <h4>显示选项</h4>
          <div class="filter-options">
            <el-checkbox v-model="displayOptions.showDrones" @change="updateDisplay">无人机</el-checkbox>
            <el-checkbox v-model="displayOptions.showNests" @change="updateDisplay">机巢</el-checkbox>
            <el-checkbox v-model="displayOptions.showPlannedPaths" @change="updateDisplay">规划路径</el-checkbox>
            <el-checkbox v-model="showLabels" @change="updateDisplay">显示标签</el-checkbox>
          </div>
        </div>

        <div class="panel-section">
          <h4>3D视角</h4>
          <div class="control-buttons">
            <div class="slider-control">
              <span class="slider-label">倾斜角度: {{ pitchValue }}°</span>
              <el-slider v-model="pitchValue" :min="0" :max="80" :disabled="!mapReady" @change="updatePitch" />
            </div>
            <div class="slider-control">
              <span class="slider-label">旋转角度: {{ rotationValue }}°</span>
              <el-slider v-model="rotationValue" :min="0" :max="360" :disabled="!mapReady" @change="updateRotation" />
            </div>
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
          <h4>图例</h4>
          <div class="legend">
            <div class="legend-group">
              <div class="legend-title">无人机状态</div>
              <div class="legend-item"><span class="legend-color" style="background: #00e676;"></span><span>空闲</span></div>
              <div class="legend-item"><span class="legend-color" style="background: #00d4ff;"></span><span>飞行中</span></div>
              <div class="legend-item"><span class="legend-color" style="background: #ffab00;"></span><span>充电中</span></div>
              <div class="legend-item"><span class="legend-color" style="background: #ff5252;"></span><span>故障/低电量</span></div>
              <div class="legend-item"><span class="legend-color" style="background: #607d8b;"></span><span>离线</span></div>
            </div>
            <div class="legend-group">
              <div class="legend-title">机巢状态</div>
              <div class="legend-item"><span class="legend-color nest-available"></span><span>可用</span></div>
              <div class="legend-item"><span class="legend-color nest-occupied"></span><span>占用</span></div>
              <div class="legend-item"><span class="legend-color nest-fault"></span><span>故障</span></div>
              <div class="legend-item"><span class="legend-color nest-offline"></span><span>离线</span></div>
            </div>
            <div class="legend-group">
              <div class="legend-title">路径</div>
              <div class="legend-item"><span class="legend-color path-planned"></span><span>规划路径</span></div>
              <div class="legend-item"><span class="legend-color path-executed"></span><span>已执行</span></div>
            </div>
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

        <div class="detail-actions">
          <el-button type="primary" @click="centerOnDrone" :disabled="!selectedDrone.signal?.connected">
            <el-icon><Aim v-if="trackingDrone !== selectedDrone.drone_id" /><Close v-else /></el-icon>
            {{ trackingDrone === selectedDrone.drone_id ? '取消跟踪' : '居中跟踪' }}
          </el-button>
          <el-button type="success" @click="openPathPlanning" :disabled="!selectedDrone.signal?.connected">
            <el-icon><Route /></el-icon>规划路径
          </el-button>
          <el-button v-if="realtimeStore.plannedPaths.has(selectedDrone.drone_id)" type="danger" @click="clearCurrentPath">
            <el-icon><Delete /></el-icon>清除路径
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
            <span class="efficiency-score">效率: {{ plannedPath.efficiency_score }}</span>
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
            </div>
          </div>
        </div>

        <div class="unmatched-section" v-if="intelligentMatchResult.unmatchedDrones?.length > 0">
          <el-divider content-position="left">未匹配无人机 ({{ intelligentMatchResult.unmatchedDrones.length }})</el-divider>
          <div class="unmatched-list">
            <el-tag v-for="item in intelligentMatchResult.unmatchedDrones" :key="item.drone_id" type="warning" style="margin: 4px;">
              {{ item.drone_id }}: {{ item.reason === 'battery_insufficient' ? '电量不足' : item.reason === 'no_available_nest' ? '无可用机巢' : '未选中' }}
            </el-tag>
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
import {
  loadAmap,
  createMap,
  createScaleControl,
  createToolBarControl,
  createControlBarControl,
  createDroneIcon,
  createNestIcon,
  createInfoWindowContent,
  createWaypointMarkerConfig,
  getPathStyle,
  getPathBorderStyle,
  DRONE_STATUS_CONFIG,
  NEST_STATUS_CONFIG
} from '@/utils/amap'

const nestStore = useNestStore()
const realtimeStore = useRealtimeStore()

const mapContainer = ref(null)
const searchKeyword = ref('')
const currentMapType = ref('dark')
const showDroneDrawer = ref(false)
const showPathDrawer = ref(false)
const selectedDroneId = ref(null)
const selectedDrone = computed(() => {
  if (!selectedDroneId.value) return null
  return realtimeStore.drones.find(d => d.drone_id === selectedDroneId.value) || null
})
const mapLoading = ref(true)
const mapError = ref('')
const mapReady = ref(false)
const pitchValue = ref(45)
const rotationValue = ref(0)
const panelVisible = ref(true)
const trackingDrone = ref(null)
const plannedPath = ref(null)
const planningLoading = ref(false)
const intelligentMatchResult = ref(null)
const recommendedNests = ref([])
const showIntelligentMatch = ref(false)
const showLabels = ref(false)

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

const availableNests = computed(() => {
  const src = realtimeStore.nests.length > 0 ? realtimeStore.nests : nestStore.nests
  return src.filter(n => n.status === 1)
})

let map = null
let AMapInstance = null
let droneMarkersMap = new Map()
let nestMarkersMap = new Map()
let plannedPathPolylines = []
let waypointMarkers = []
let infoWindow = null
let animationFrameId = null
let satelliteLayers = []
let initMapTimer = null
let pitchUpdateTimer = null
let resetViewTimer = null

const togglePanel = () => { panelVisible.value = !panelVisible.value }

const getDroneStatusClass = (drone) => {
  if (!drone.signal?.connected) return 'offline'
  const classes = { 0: 'idle', 1: 'flying', 2: 'charging', 3: 'fault' }
  return classes[drone.status] || 'idle'
}

const getDroneStatusText = (status) => {
  const texts = { 0: '空闲', 1: '飞行中', 2: '充电中', 3: '故障' }
  return texts[status] || '未知'
}

const getDroneTypeText = (type) => {
  const texts = { 1: '固定路线', 2: '周期性', 3: '临时性' }
  return texts[type] || '未知'
}

const getBatteryClass = (battery) => {
  if (battery == null || isNaN(battery)) return 'medium'
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

const currentZoom = ref(13)
const currentPitch = ref(45) // 跟踪地图倾斜角度
const markerScale = computed(() => {
  const zoom = currentZoom.value
  if (zoom >= 16) return 1.3
  if (zoom >= 14) return 1.1
  if (zoom >= 12) return 1.0
  if (zoom >= 10) return 0.85
  return 0.7
})

/**
 * 初始化地图
 */
const initMap = async () => {
  mapLoading.value = true
  mapError.value = ''

  if (!mapContainer.value) {
    mapLoading.value = false
    mapError.value = '地图容器未找到'
    return
  }

  try {
    AMapInstance = await loadAmap()

    // 创建地图实例
    map = createMap(mapContainer.value, {
      zoom: 13,
      center: [117.2272, 31.8206],
      pitch: 45,
      rotation: 0
    })

    // 添加原生控件
    map.addControl(createScaleControl())
    map.addControl(createToolBarControl())
    map.addControl(createControlBarControl())

    // 创建信息窗口实例
    infoWindow = new AMapInstance.InfoWindow({
      isCustom: true,
      offset: new AMapInstance.Pixel(0, -20),
      autoMove: true
    })

    // 地图加载完成
    map.on('complete', () => {
      mapLoading.value = false
      mapReady.value = true
      currentZoom.value = map.getZoom()
      currentPitch.value = map.getPitch()
      ElMessage.success('地图加载成功')

      // 创建标记
      createNestMarkers()
      startRenderLoop()
    })

    // 缩放事件
    map.on('zoomend', () => {
      const newZoom = map.getZoom()
      const oldZoom = currentZoom.value
      currentZoom.value = newZoom

      if (Math.abs(newZoom - oldZoom) >= 1) {
        updateAllMarkerIcons()
      }
    })

    // 倾斜角度变化事件 - 更新标记的3D透视效果
    map.on('pitchchange', () => {
      const newPitch = map.getPitch()
      const oldPitch = currentPitch.value
      currentPitch.value = newPitch

      // pitch变化超过2度时更新标记
      if (Math.abs(newPitch - oldPitch) >= 2) {
        updateAllMarkerIcons()
      }
    })

    // 旋转角度变化事件
    map.on('rotatechange', () => {
      // 旋转时标记也需要更新（无人机航向是绝对角度）
      updateAllMarkerIcons()
    })

    // 地图点击事件 - 关闭信息窗口
    map.on('click', () => {
      infoWindow?.close()
    })

    // 错误处理
    map.on('error', (e) => {
      mapLoading.value = false
      mapError.value = '地图加载失败: ' + (e.message || '未知错误')
    })
  } catch (error) {
    mapLoading.value = false
    mapError.value = '地图初始化失败: ' + error.message
    console.error('地图初始化错误:', error)
  }
}

/**
 * 创建机巢标记
 */
const createNestMarkers = () => {
  if (!map || !mapReady.value) return

  // 清除旧标记
  nestMarkersMap.forEach(marker => map.remove(marker))
  nestMarkersMap.clear()

  if (!displayOptions.showNests) return

  const nestsData = realtimeStore.nests.length > 0 ? realtimeStore.nests : nestStore.nests
  const pitch = currentPitch.value

  nestsData.forEach(nest => {
    const lng = parseFloat(nest.longitude)
    const lat = parseFloat(nest.latitude)
    if (!lng || !lat || isNaN(lng) || isNaN(lat)) return

    const position = [lng, lat]
    const scale = markerScale.value

    const marker = new AMapInstance.Marker({
      position,
      content: createNestIcon(nest, scale, pitch),
      offset: new AMapInstance.Pixel(-20 * scale, -20 * scale),
      extData: { type: 'nest', data: nest },
      zIndex: 10
    })

    // 点击事件 - 显示信息窗口
    marker.on('click', (e) => {
      const content = createInfoWindowContent(nest, 'nest')
      infoWindow.setContent(content)
      infoWindow.open(map, e.target.getPosition())
    })

    // 鼠标移入 - 高亮
    marker.on('mouseover', () => {
      marker.setzIndex(15)
    })

    marker.on('mouseout', () => {
      marker.setzIndex(10)
    })

    nestMarkersMap.set(nest.nest_id, marker)
    map.add(marker)

    // 添加标签
    if (showLabels.value) {
      addLabelMarker(position, nest.nest_name || nest.nest_id, 'nest')
    }
  })
}

/**
 * 更新无人机标记
 */
const updateDroneMarkers = () => {
  if (!map || !mapReady.value) return

  if (!displayOptions.showDrones) {
    droneMarkersMap.forEach(marker => map.remove(marker))
    droneMarkersMap.clear()
    return
  }

  const currentDroneIds = new Set()
  const scale = markerScale.value
  const pitch = currentPitch.value

  realtimeStore.drones.forEach(drone => {
    const lng = drone.position?.lng
    const lat = drone.position?.lat
    if (!lng || !lat || isNaN(lng) || isNaN(lat)) return

    currentDroneIds.add(drone.drone_id)
    const position = [lng, lat]

    if (droneMarkersMap.has(drone.drone_id)) {
      // 更新现有标记
      const marker = droneMarkersMap.get(drone.drone_id)

      // 先更新图标和样式
      marker.setContent(createDroneIcon(drone, scale, pitch))
      marker.setOffset(new AMapInstance.Pixel(-18 * scale, -18 * scale))
      marker.setExtData({ type: 'drone', data: drone })

      // 最后设置位置（setContent会重置内部状态，必须在最后调用setPosition确保位置正确）
      marker.setPosition(position)

      // 根据状态设置 z-index
      const zIndex = getDroneZIndex(drone)
      marker.setzIndex(zIndex)
    } else {
      // 创建新标记
      const zIndex = getDroneZIndex(drone)

      const marker = new AMapInstance.Marker({
        position,
        content: createDroneIcon(drone, scale, pitch),
        offset: new AMapInstance.Pixel(-18 * scale, -18 * scale),
        extData: { type: 'drone', data: drone },
        zIndex
      })

      // 点击事件
      marker.on('click', (e) => {
        selectDrone(drone)
        const content = createInfoWindowContent(drone, 'drone')
        infoWindow.setContent(content)
        infoWindow.open(map, e.target.getPosition())
      })

      // 鼠标事件
      marker.on('mouseover', () => {
        marker.setzIndex(40)
      })

      marker.on('mouseout', () => {
        marker.setzIndex(getDroneZIndex(drone))
      })

      droneMarkersMap.set(drone.drone_id, marker)
      map.add(marker)
    }
  })

  // 清除不存在的无人机标记
  droneMarkersMap.forEach((marker, droneId) => {
    if (!currentDroneIds.has(droneId)) {
      map.remove(marker)
      droneMarkersMap.delete(droneId)
    }
  })
}

/**
 * 获取无人机 z-index
 */
const getDroneZIndex = (drone) => {
  if (drone.status === 2) return 30
  if (drone.status === 1) return 25
  if ((drone.battery?.current || 0) < 20) return 28
  if (!drone.signal?.connected) return 15
  return 20
}

/**
 * 更新所有标记图标（缩放、3D透视）
 */
const updateAllMarkerIcons = () => {
  const scale = markerScale.value
  const pitch = currentPitch.value

  // 更新机巢标记
  nestMarkersMap.forEach((marker, nestId) => {
    const nest = marker.getExtData()?.data
    if (nest) {
      marker.setContent(createNestIcon(nest, scale, pitch))
      marker.setOffset(new AMapInstance.Pixel(-20 * scale, -20 * scale))
    }
  })

  // 更新无人机标记
  droneMarkersMap.forEach((marker, droneId) => {
    const drone = marker.getExtData()?.data
    if (drone) {
      marker.setContent(createDroneIcon(drone, scale, pitch))
      marker.setOffset(new AMapInstance.Pixel(-18 * scale, -18 * scale))
    }
  })
}

/**
 * 统一坐标提取 - 处理各种格式的坐标
 * @param {Object} waypoint - 航点对象
 * @returns {Array|null} [lng, lat] 或 null
 */
const extractLngLat = (waypoint) => {
  if (!waypoint) return null

  const pos = waypoint.position || waypoint

  // 尝试所有可能的字段名
  const lng = Number(pos.lng ?? pos.lon ?? pos.longitude ?? waypoint.lng ?? waypoint.lon ?? waypoint.longitude)
  const lat = Number(pos.lat ?? pos.latitude ?? waypoint.lat ?? waypoint.latitude)

  // 验证坐标有效性
  if (!isFinite(lng) || !isFinite(lat)) return null
  if (lng === 0 && lat === 0) return null
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null

  return [lng, lat]
}

/**
 * 计算两点间的距离（米）- 使用 Haversine 公式
 */
const haversineDistance = (p1, p2) => {
  const R = 6371000
  const dLat = (p2[1] - p1[1]) * Math.PI / 180
  const dLon = (p2[0] - p1[0]) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 找到路径上距离无人机最近的点的索引
 * @param {Array} path - 路径坐标数组 [[lng, lat], ...]
 * @param {Array} dronePos - 无人机位置 [lng, lat]
 * @returns {number} 最近点的索引
 */
const findNearestPathIndex = (path, dronePos) => {
  if (!path || path.length === 0 || !dronePos) return -1

  let minDist = Infinity
  let nearestIdx = 0

  for (let i = 0; i < path.length; i++) {
    const dist = haversineDistance(path[i], dronePos)
    if (dist < minDist) {
      minDist = dist
      nearestIdx = i
    }
  }

  return nearestIdx
}

/**
 * 绘制规划路径 - 支持路径分段变灰
 */
const drawPlannedPath = () => {
  if (!map || !mapReady.value) return

  // 清除旧路径
  plannedPathPolylines.forEach(p => map.remove(p))
  plannedPathPolylines = []
  waypointMarkers.forEach(m => map.remove(m))
  waypointMarkers = []

  if (!displayOptions.showPlannedPaths) return

  // 支持多个无人机的路径
  const pathsToDraw = []

  // 当前选中的路径
  if (plannedPath.value?.waypoints?.length) {
    pathsToDraw.push({
      pathData: plannedPath.value,
      droneId: pathPlanning.drone_id
    })
  }

  // 从 realtimeStore 获取所有已应用的路径
  realtimeStore.plannedPaths.forEach((pathData, droneId) => {
    if (pathData?.waypoints?.length && !pathsToDraw.find(p => p.droneId === droneId)) {
      pathsToDraw.push({ pathData, droneId })
    }
  })

  pathsToDraw.forEach(({ pathData, droneId }) => {
    drawSinglePath(pathData, droneId)
  })
}

/**
 * 绘制单条路径
 */
const drawSinglePath = (pathData, droneId) => {
  const waypoints = pathData.waypoints
  const path = waypoints.map(extractLngLat).filter(Boolean)

  if (path.length < 2) {
    console.warn('路径点不足:', path.length)
    return
  }

  // 获取无人机当前位置
  const drone = droneId ? realtimeStore.getDroneById(droneId) : null
  const dronePos = drone?.position ? [drone.position.lng, drone.position.lat] : null

  // 找到最近的路径点索引
  let splitIndex = -1
  if (dronePos) {
    splitIndex = findNearestPathIndex(path, dronePos)
  }

  if (splitIndex > 0 && splitIndex < path.length - 1) {
    // 分段绘制：已执行路径（灰色）+ 待执行路径（亮色）
    const executedPath = path.slice(0, splitIndex + 1)
    const remainingPath = path.slice(splitIndex)

    // 已执行路径 - 灰色半透明
    if (executedPath.length >= 2) {
      const executedPolyline = new AMapInstance.Polyline({
        path: executedPath,
        strokeColor: '#546e7a',
        strokeWeight: 4,
        strokeOpacity: 0.5,
        strokeStyle: 'solid',
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 15,
        extData: { type: 'executed', droneId }
      })
      map.add(executedPolyline)
      plannedPathPolylines.push(executedPolyline)
    }

    // 待执行路径 - 亮色
    const remainingPolyline = new AMapInstance.Polyline({
      path: remainingPath,
      strokeColor: '#00d4ff',
      strokeWeight: 5,
      strokeOpacity: 0.9,
      strokeStyle: 'solid',
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 20,
      showDir: true,
      extData: { type: 'remaining', droneId }
    })
    map.add(remainingPolyline)
    plannedPathPolylines.push(remainingPolyline)

    // 路径边框
    const borderPolyline = new AMapInstance.Polyline({
      path: remainingPath,
      strokeColor: '#ffffff',
      strokeWeight: 8,
      strokeOpacity: 0.15,
      strokeStyle: 'solid',
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 19,
      extData: { type: 'border', droneId }
    })
    map.add(borderPolyline)
    plannedPathPolylines.push(borderPolyline)

    // 在分段点添加标记
    const splitMarker = new AMapInstance.Marker({
      position: path[splitIndex],
      content: '<div style="width:12px;height:12px;background:#ff9800;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px rgba(255,152,0,0.6);"></div>',
      offset: new AMapInstance.Pixel(-6, -6),
      zIndex: 25,
      extData: { type: 'progress', droneId }
    })
    map.add(splitMarker)
    waypointMarkers.push(splitMarker)

  } else {
    // 未开始执行 - 整条路径显示为亮色
    const borderPolyline = new AMapInstance.Polyline({
      path,
      strokeColor: '#ffffff',
      strokeWeight: 8,
      strokeOpacity: 0.15,
      strokeStyle: 'solid',
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 19,
      extData: { type: 'border', droneId }
    })
    map.add(borderPolyline)
    plannedPathPolylines.push(borderPolyline)

    const mainPolyline = new AMapInstance.Polyline({
      path,
      strokeColor: '#00d4ff',
      strokeWeight: 5,
      strokeOpacity: 0.9,
      strokeStyle: 'solid',
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 20,
      showDir: true,
      extData: { type: 'planned', droneId }
    })
    map.add(mainPolyline)
    plannedPathPolylines.push(mainPolyline)
  }

  // 添加起点标记
  const startMarker = new AMapInstance.Marker({
    position: path[0],
    content: '<div style="width:16px;height:16px;background:#4caf50;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px rgba(76,175,80,0.6);"></div>',
    offset: new AMapInstance.Pixel(-8, -8),
    zIndex: 30,
    extData: { type: 'start', droneId }
  })
  map.add(startMarker)
  waypointMarkers.push(startMarker)

  // 添加终点标记
  const endMarker = new AMapInstance.Marker({
    position: path[path.length - 1],
    content: '<div style="width:20px;height:20px;background:#ff5252;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(255,82,82,0.8);"></div>',
    offset: new AMapInstance.Pixel(-10, -10),
    zIndex: 30,
    extData: { type: 'end', droneId }
  })
  map.add(endMarker)
  waypointMarkers.push(endMarker)

  // 添加中间航点标记（如果数量不多）
  if (path.length <= 15) {
    for (let i = 1; i < path.length - 1; i++) {
      const wpMarker = new AMapInstance.Marker({
        position: path[i],
        content: '<div style="width:10px;height:10px;background:#00d4ff;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(0,212,255,0.5);opacity:0.7;"></div>',
        offset: new AMapInstance.Pixel(-5, -5),
        zIndex: 25,
        extData: { type: 'waypoint', index: i, droneId }
      })
      map.add(wpMarker)
      waypointMarkers.push(wpMarker)
    }
  }
}

/**
 * 更新路径显示（在渲染循环中调用）
 * 临时禁用自动更新，避免性能问题
 */
const updatePathDisplay = () => {
  // 暂时禁用自动路径更新，路径只在手动规划时绘制
  return
}

/**
 * 清除所有路径
 */
const clearPlannedPath = () => {
  plannedPathPolylines.forEach(p => map?.remove(p))
  plannedPathPolylines = []
  waypointMarkers.forEach(m => map?.remove(m))
  waypointMarkers = []
  plannedPath.value = null
  ElMessage.info('已清除路径')
}

/**
 * 清除当前选中无人机的路径
 */
const clearCurrentPath = () => {
  if (selectedDrone.value) {
    realtimeStore.clearPlannedPath(selectedDrone.value.drone_id)
    plannedPath.value = null
    // 重绘剩余路径
    drawPlannedPath()
    ElMessage.info('已清除当前无人机路径')
  }
}

/**
 * 渲染循环
 */
let lastUpdateTime = 0
let lastPathUpdateTime = 0
const UPDATE_INTERVAL = 1000
const PATH_UPDATE_INTERVAL = 2000 // 路径更新频率较低

const startRenderLoop = () => {
  const render = (timestamp) => {
    if (timestamp - lastUpdateTime >= UPDATE_INTERVAL) {
      lastUpdateTime = timestamp
      updateDroneMarkers()

      // 跟踪无人机
      if (trackingDrone.value) {
        const drone = realtimeStore.getDroneById(trackingDrone.value)
        if (drone?.position && map) {
          map.setCenter([drone.position.lng, drone.position.lat])
        }
      }
    }

    // 路径更新（频率较低，避免频繁重绘）
    if (timestamp - lastPathUpdateTime >= PATH_UPDATE_INTERVAL) {
      lastPathUpdateTime = timestamp
      updatePathDisplay()
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
  selectedDroneId.value = drone.drone_id
  showDroneDrawer.value = true
}

const centerOnDrone = () => {
  if (selectedDrone.value && map) {
    if (trackingDrone.value === selectedDrone.value.drone_id) {
      trackingDrone.value = null
      ElMessage.info('已取消跟踪')
    } else {
      if (selectedDrone.value.position) {
        trackingDrone.value = selectedDrone.value.drone_id
        map.setCenter([selectedDrone.value.position.lng, selectedDrone.value.position.lat])
        map.setZoom(16)
      }
    }
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
  if (!drone?.position) {
    ElMessage.error('无人机位置数据不可用')
    return
  }

  planningLoading.value = true
  try {
    const requestData = {
      ...pathPlanning,
      start_position: {
        lat: drone.position.lat,
        lng: drone.position.lng,
        altitude: drone.position.altitude,
        battery: drone.battery?.current
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
    realtimeStore.applyPath(pathPlanning.drone_id, plannedPath.value)
    showPathDrawer.value = false
    ElMessage.success('路径已应用')
  }
}

const fetchRecommendedNests = async () => {
  if (!pathPlanning.drone_id) return
  try {
    const res = await pathApi.getBestNest(pathPlanning.drone_id)
    if (res.code === 200 && res.data) {
      recommendedNests.value = res.data.recommended_nests || []
    }
  } catch (error) {
    console.error('获取推荐机巢失败:', error)
    ElMessage.warning('获取推荐机巢失败')
  }
}

const runIntelligentMatch = async () => {
  planningLoading.value = true
  try {
    const requestData = {}
    if (pathPlanning.drone_id) {
      requestData.drone_ids = [pathPlanning.drone_id]
    }

    const res = await pathApi.intelligentMatch(requestData)
    if (res.code === 200 && res.data) {
      intelligentMatchResult.value = res.data
      showIntelligentMatch.value = true
      const count = res.data.summary?.total_assignments || 0
      ElMessage.success(`智能匹配完成，共匹配 ${count} 架无人机`)
    } else {
      ElMessage.error(res.message || '智能匹配返回数据异常')
    }
  } catch (error) {
    ElMessage.error('智能匹配失败: ' + (error.message || '未知错误'))
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
      const pathData = assignment.path || assignment
      if (pathData.waypoints?.length) {
        realtimeStore.applyPath(assignment.drone_id, pathData)
      }
    })
    showIntelligentMatch.value = false
    ElMessage.success('智能匹配结果已应用')
  }
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
  // 清除旧的卫星图层
  if (satelliteLayers.length) {
    satelliteLayers.forEach(l => map?.remove(l))
    satelliteLayers = []
  }
  const styles = {
    dark: 'amap://styles/dark',
    light: 'amap://styles/normal',
    satellite: 'amap://styles/normal'
  }
  map?.setMapStyle(styles[type])
  if (type === 'satellite') {
    const satelliteLayer = new AMapInstance.TileLayer.Satellite()
    const roadNetLayer = new AMapInstance.TileLayer.RoadNet()
    map.add([satelliteLayer, roadNetLayer])
    satelliteLayers = [satelliteLayer, roadNetLayer]
  }
}

const updatePitch = (value) => {
  map?.setPitch(value, true, 500)
  currentPitch.value = value
  // 延迟更新标记，等动画完成
  pitchUpdateTimer = setTimeout(() => updateAllMarkerIcons(), 550)
}
const updateRotation = (value) => map?.setRotation(value, true, 500)

const resetView = () => {
  pitchValue.value = 45
  rotationValue.value = 0
  currentPitch.value = 45
  trackingDrone.value = null
  map?.setPitch(45, true, 500)
  map?.setRotation(0, true, 500)
  map?.setZoomAndCenter(13, [117.2272, 31.8206])
  resetViewTimer = setTimeout(() => updateAllMarkerIcons(), 550)
}

const searchEntity = () => {
  if (!searchKeyword.value || !map) return

  const drone = realtimeStore.drones.find(d =>
    d.drone_id.toLowerCase().includes(searchKeyword.value.toLowerCase())
  )

  if (drone) {
    if (drone.position) {
      map.setCenter([drone.position.lng, drone.position.lat])
      map.setZoom(16)
    }
    selectDrone(drone)
    return
  }

  const nestSrc = realtimeStore.nests.length > 0 ? realtimeStore.nests : nestStore.nests
  const nest = nestSrc.find(n =>
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

// 监听连接状态
watch(() => realtimeStore.connectionStatus, (status) => {
  if (status === 'disconnected') {
    ElMessage.warning('WebSocket连接已断开')
  } else if (status === 'connected') {
    ElMessage.success('WebSocket连接成功')
  }
})

// 监听选中无人机变化
watch(() => selectedDrone.value?.drone_id, (droneId) => {
  if (droneId) {
    pathPlanning.drone_id = droneId
  }
})

// 监听机巢数据变化
watch(() => nestStore.nests, (newNests) => {
  if (newNests.length > 0 && mapReady.value && realtimeStore.nests.length === 0) {
    createNestMarkers()
  }
}, { deep: true })

watch(() => realtimeStore.nests, (newNests) => {
  if (newNests.length > 0 && mapReady.value) {
    createNestMarkers()
  }
}, { deep: true })

// 监听路径变化
watch(() => realtimeStore.plannedPaths, () => {
  if (mapReady.value) {
    drawPlannedPath()
  }
}, { deep: true })

onMounted(async () => {
  await nestStore.fetchNests()
  realtimeStore.connect()
  await nextTick()
  initMapTimer = setTimeout(() => initMap(), 500)
})

onUnmounted(() => {
  // 清除所有待执行的定时器
  if (initMapTimer) clearTimeout(initMapTimer)
  if (pitchUpdateTimer) clearTimeout(pitchUpdateTimer)
  if (resetViewTimer) clearTimeout(resetViewTimer)

  stopRenderLoop()
  realtimeStore.disconnect()

  // 清除所有标记
  droneMarkersMap.forEach(marker => map?.remove(marker))
  droneMarkersMap.clear()
  nestMarkersMap.forEach(marker => map?.remove(marker))
  nestMarkersMap.clear()
  plannedPathPolylines.forEach(p => map?.remove(p))
  waypointMarkers.forEach(m => map?.remove(m))

  // 销毁地图
  if (map) {
    map.destroy()
    map = null
  }
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
  background: rgba($bg-card, 0.65);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-radius: 20px;
  font-size: 13px;
  z-index: 20;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  color: $text-secondary;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $text-muted;
    transition: all 0.3s ease;
  }

  &.connected {
    border-color: rgba($success-color, 0.25);
    .status-dot { background: $success-color; box-shadow: 0 0 8px $success-color, 0 0 3px $success-color; }
  }
  &.disconnected, &.error {
    border-color: rgba($danger-color, 0.25);
    .status-dot { background: $danger-color; box-shadow: 0 0 8px $danger-color; }
  }
  &.connecting {
    border-color: rgba($warning-color, 0.25);
    .status-dot { background: $warning-color; animation: pulse 1s infinite; }
  }
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
  background: rgba($bg-card, 0.65);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-radius: 20px;
  font-size: 13px;
  z-index: 20;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  color: $text-primary;

  .el-icon { color: $primary-color; filter: drop-shadow(0 0 4px rgba($primary-color, 0.5)); }
}

.map-controls {
  position: absolute;
  top: 70px;
  right: 300px;
  display: flex;
  gap: 8px;
  z-index: 20;

  :deep(.el-button-group) {
    .el-button {
      background: rgba($bg-card, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-color: rgba(255, 255, 255, 0.1);
      color: $text-secondary;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

      &:hover {
        background: rgba($primary-color, 0.15);
        border-color: rgba($primary-color, 0.4);
        color: $primary-color;
      }

      &.el-button--primary {
        background: rgba($primary-color, 0.2);
        border-color: rgba($primary-color, 0.5);
        color: $primary-color;
        box-shadow: 0 0 12px rgba($primary-color, 0.15);
      }
    }
  }

  > .el-button {
    background: rgba($bg-card, 0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-color: rgba(255, 255, 255, 0.1);
    color: $text-secondary;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

    &:hover {
      background: rgba($primary-color, 0.15);
      border-color: rgba($primary-color, 0.4);
      color: $primary-color;
    }
  }
}

.control-panel {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  background: rgba($bg-card, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
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
      padding-left: 10px;
      border-left: 2px solid $primary-color;
      line-height: 1;
      padding-top: 1px;
      padding-bottom: 1px;
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
      transition: all 0.2s ease;
      margin-bottom: 8px;
      background: rgba($bg-darker, 0.4);
      border: 1px solid transparent;

      &:hover {
        background: rgba($primary-color, 0.08);
        border-color: rgba($primary-color, 0.15);
        box-shadow: 0 0 12px rgba($primary-color, 0.06);
      }
      &.selected {
        background: rgba($primary-color, 0.15);
        border-color: rgba($primary-color, 0.4);
        box-shadow: 0 0 16px rgba($primary-color, 0.1);
      }
      &.offline { opacity: 0.55; }

      .drone-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;

        &.flying { background: rgba($primary-color, 0.2); color: $primary-color; box-shadow: 0 0 8px rgba($primary-color, 0.15); }
        &.idle { background: rgba($success-color, 0.2); color: $success-color; box-shadow: 0 0 8px rgba($success-color, 0.15); }
        &.charging { background: rgba($warning-color, 0.2); color: $warning-color; box-shadow: 0 0 8px rgba($warning-color, 0.15); }
        &.fault { background: rgba($danger-color, 0.2); color: $danger-color; box-shadow: 0 0 8px rgba($danger-color, 0.15); }
        &.offline { background: rgba($text-muted, 0.15); color: $text-muted; }
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
    gap: 16px;

    .legend-group {
      .legend-title {
        font-size: 11px;
        color: $text-muted;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: $text-secondary;
      margin-bottom: 5px;

      .legend-color {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 6px currentColor;

        &.nest-available {
          background: #00e676;
          border-radius: 4px;
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
        &.path-planned {
          background: #00d4ff;
          border-radius: 2px;
          width: 20px;
          height: 3px;
        }
        &.path-executed {
          background: #546e7a;
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
  background: rgba($bg-card, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-right: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
  transition: all 0.3s ease;
  z-index: 50;

  &.btn-collapsed { right: 0; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px 0 0 8px; }
  &:hover {
    background: rgba($primary-color, 0.2);
    color: $primary-color;
    border-color: rgba($primary-color, 0.4);
    box-shadow: 0 0 12px rgba($primary-color, 0.15);
  }
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
    --el-input-bg-color: rgba($bg-card, 0.65);
    --el-input-border-color: rgba(255, 255, 255, 0.1);
    --el-input-text-color: #{$text-primary};
    --el-input-placeholder-color: #{$text-muted};
    .el-input__wrapper {
      border-radius: 24px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      transition: all 0.25s ease;

      &:hover {
        border-color: rgba($primary-color, 0.3);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 12px rgba($primary-color, 0.08);
      }

      &.is-focus {
        border-color: rgba($primary-color, 0.5);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 20px rgba($primary-color, 0.12);
      }
    }
  }
}

.drone-detail-panel {
  .detail-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    margin-bottom: 16px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);

    .drone-avatar {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      transition: box-shadow 0.3s ease;
      &.flying { background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.25); box-shadow: 0 0 16px rgba(0, 212, 255, 0.15); }
      &.idle { background: rgba(0, 230, 118, 0.15); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.25); box-shadow: 0 0 16px rgba(0, 230, 118, 0.15); }
      &.charging { background: rgba(255, 171, 0, 0.15); color: #ffab00; border: 1px solid rgba(255, 171, 0, 0.25); box-shadow: 0 0 16px rgba(255, 171, 0, 0.15); }
      &.fault { background: rgba(255, 82, 82, 0.15); color: #ff5252; border: 1px solid rgba(255, 82, 82, 0.25); box-shadow: 0 0 16px rgba(255, 82, 82, 0.15); }
      &.offline { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); }
    }

    .drone-basic {
      flex: 1;
      .drone-name { font-size: 18px; font-weight: 600; color: #f0f4f8; }
      .drone-type { font-size: 13px; color: rgba(255, 255, 255, 0.55); }
    }

    .status-badge {
      padding: 6px 14px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      &.flying { background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.25); }
      &.idle { background: rgba(0, 230, 118, 0.15); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.25); }
      &.charging { background: rgba(255, 171, 0, 0.15); color: #ffab00; border: 1px solid rgba(255, 171, 0, 0.25); }
      &.fault { background: rgba(255, 82, 82, 0.15); color: #ff5252; border: 1px solid rgba(255, 82, 82, 0.25); }
      &.offline { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); }
    }
  }

  .detail-section {
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    transition: border-color 0.2s ease;

    &:hover {
      border-color: rgba(255, 255, 255, 0.12);
    }

    h4 { font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.65); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;

      .info-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.04);
        .label { font-size: 11px; color: rgba(255, 255, 255, 0.5); }
        .value { font-size: 14px; color: #f0f4f8; font-weight: 600; }
      }
    }

    .battery-display {
      .battery-info {
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.55);
      }
    }

    .signal-display {
      display: flex;
      align-items: center;
      gap: 12px;

      .signal-bars {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        .bar {
          width: 5px;
          height: 12px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 2px;
          transition: all 0.2s ease;
          &.active { background: #00e676; box-shadow: 0 0 4px rgba(0, 230, 118, 0.4); }
          &:nth-child(2) { height: 16px; }
          &:nth-child(3) { height: 20px; }
          &:nth-child(4) { height: 24px; }
          &:nth-child(5) { height: 28px; }
        }
      }

      .signal-value { font-size: 14px; font-weight: 600; color: #f0f4f8; }
      .signal-status {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.45);
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
        color: #f0f4f8;
        margin: 0;

        .el-icon {
          color: #00d4ff;
        }
      }
    }

    .section-desc {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.55);
      margin: 0;
    }
  }

  .path-form {
    margin-bottom: 20px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.07);

    h4 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #f0f4f8;
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
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(0, 212, 255, 0.3);
        box-shadow: 0 0 12px rgba(0, 212, 255, 0.08);
      }

      &.selected {
        background: rgba(0, 212, 255, 0.1);
        border-color: #00d4ff;
        box-shadow: 0 0 16px rgba(0, 212, 255, 0.12);
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
          color: #f0f4f8;
          margin-bottom: 4px;
        }

        .nest-stats {
          display: flex;
          gap: 12px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.55);
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
        background: rgba(255, 255, 255, 0.04);
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        transition: border-color 0.2s ease;

        &:hover {
          border-color: rgba(255, 255, 255, 0.12);
        }

        .el-icon {
          font-size: 20px;
          color: #00d4ff;
        }

        .info-content {
          .label {
            display: block;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            margin-bottom: 2px;
          }

          .value {
            font-size: 16px;
            font-weight: 600;
            color: #f0f4f8;

            &.warning {
              color: #ffab00;
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
      background: rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.07);

      .summary-value {
        font-size: 28px;
        font-weight: 700;
        color: #f0f4f8;
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
        color: rgba(255, 255, 255, 0.55);
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
      background: rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.07);

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
        color: rgba(255, 255, 255, 0.55);
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
  .map-controls { right: 300px; }
}

:deep(.el-drawer) {
  .el-drawer__header {
    margin-bottom: 0;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 22, 40, 0.92);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);

    .el-drawer__title {
      font-size: 16px;
      font-weight: 600;
      color: #f0f4f8;
    }

    .el-drawer__close-btn {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
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
        box-shadow: 0 0 12px rgba(255, 82, 82, 0.15);
      }
    }
  }

  .el-drawer__body {
    padding: 20px;
    background: rgba(10, 22, 40, 0.88);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
}
</style>
