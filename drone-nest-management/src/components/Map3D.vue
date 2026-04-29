<template>
  <div class="map-3d-container">
    <div class="map-controls">
      <el-button-group>
        <el-button :type="viewMode === '3D' ? 'primary' : 'default'" @click="setViewMode('3D')">
          3D视图
        </el-button>
        <el-button :type="viewMode === '2D' ? 'primary' : 'default'" @click="setViewMode('2D')">
          2D视图
        </el-button>
      </el-button-group>

      <el-slider v-model="pitch" :min="0" :max="80" :step="5" style="width: 160px; margin-left: 16px;" @change="updatePitch" />
      <el-slider v-model="rotation" :min="0" :max="360" :step="10" style="width: 160px; margin-left: 16px;" @change="updateRotation" />

      <el-button size="small" style="margin-left: 12px;" @click="verifyMatchAccuracy">
        精度验证
      </el-button>
      <el-tag v-if="accuracyResult" :type="accuracyResult.allPassed ? 'success' : 'danger'" size="small" style="margin-left: 8px;">
        {{ accuracyResult.allPassed ? '匹配通过' : `误差 ${accuracyResult.maxError.toFixed(1)}m` }}
      </el-tag>
    </div>

    <div id="map-3d" class="map-wrapper"></div>

    <div class="map-legend">
      <div class="legend-item">
        <span class="legend-color" style="background: #00e676;"></span>
        <span>空闲无人机</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #00d4ff;"></span>
        <span>飞行中</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #ffab00;"></span>
        <span>充电中</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #ff5252;"></span>
        <span>故障/低电量</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #4ecdc4;"></span>
        <span>机巢</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #ff9800;"></span>
        <span>规划路径</span>
      </div>
    </div>

    <div class="coord-debug" v-if="showDebug">
      <div class="debug-title">坐标调试</div>
      <div class="debug-row" v-for="item in debugEntities.slice(0, 5)" :key="item.id">
        <span class="debug-id">{{ item.id }}</span>
        <span class="debug-coord">{{ item.lng.toFixed(6) }}, {{ item.lat.toFixed(6) }}</span>
        <span class="debug-alt">alt: {{ item.altitude.toFixed(0) }}m</span>
        <span class="debug-status" :class="{ ok: item.matched, err: !item.matched }">
          {{ item.matched ? '✓' : '✗' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { MAP_CENTER } from '@/utils/amap'
import {
  CoordinateTransformer,
  Scene3DMatcher,
  createTransformer,
  createSceneMatcher
} from '@/utils/coordinateTransformer'

const viewMode = ref('3D')
const pitch = ref(45)
const rotation = ref(0)
const showDebug = ref(false)
const accuracyResult = ref(null)

let map = null
let object3DLayer = null
let droneMarkers3D = []
let nestMarkers3D = []
let flightPaths3D = []
let building3Ds = []
let droneLabelOverlays = []
let nestLabelOverlays = []
let transformer = null
let sceneMatcher = null
let syncTimer = null

const DRONE_STATUS_COLORS = {
  0: '#00e676',
  1: '#00d4ff',
  2: '#ffab00',
  3: '#ff5252'
}

const NEST_STATUS_COLORS = {
  0: '#5a7aa3',
  1: '#4ecdc4',
  2: '#ffab00',
  3: '#9e9e9e'
}

const props = defineProps({
  drones: { type: Array, default: () => [] },
  nests: { type: Array, default: () => [] },
  matchings: { type: Array, default: () => [] },
  buildings: { type: Array, default: () => [] },
  plannedPaths: { type: Array, default: () => [] }
})

const emit = defineEmits(['map-ready', 'marker-click', 'accuracy-verified'])

const debugEntities = computed(() => {
  const items = []
  props.drones.forEach(d => {
    const lng = d.position?.lng ?? d.longitude
    const lat = d.position?.lat ?? d.latitude
    const alt = d.position?.altitude ?? 100
    if (lng && lat) {
      items.push({
        id: d.drone_id,
        lng: Number(lng),
        lat: Number(lat),
        altitude: Number(alt),
        matched: true
      })
    }
  })
  props.nests.forEach(n => {
    const lng = Number(n.longitude)
    const lat = Number(n.latitude)
    if (lng && lat) {
      items.push({
        id: n.nest_id,
        lng,
        lat,
        altitude: 0,
        matched: true
      })
    }
  })
  return items
})

const initMap = () => {
  try {
    map = new AMap.Map('map-3d', {
      zoom: 13,
      center: MAP_CENTER,
      viewMode: viewMode.value,
      pitch: pitch.value,
      rotation: rotation.value,
      mapStyle: 'amap://styles/dark',
      showBuildingBlock: true,
      showIndoorMap: false,
      skyColor: '#1a1a2e',
      features: ['bg', 'road', 'building', 'point']
    })

    map.addControl(new AMap.Scale())
    map.addControl(new AMap.ToolBar({ position: 'RB' }))

    if (viewMode.value === '3D') {
      map.addControl(new AMap.ControlBar({
        showZoomBar: true,
        showControlButton: true,
        position: 'RT'
      }))
    }

    object3DLayer = new AMap.Object3DLayer({ zIndex: 10, opacity: 1 })
    map.add(object3DLayer)

    transformer = createTransformer(MAP_CENTER[0], MAP_CENTER[1])
    sceneMatcher = createSceneMatcher(map, transformer)

    startSceneSync()

    map.on('click', (e) => {
      if (e.lnglat) {
        const local = transformer.wgs84ToLocal(e.lnglat.lng, e.lnglat.lat, 0)
      }
    })

    emit('map-ready', map)
  } catch (error) {
    console.error('3D地图初始化失败:', error)
  }
}

const startSceneSync = () => {
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(() => {
    if (!sceneMatcher) return
    if (sceneMatcher.hasCameraChanged()) {
      const cameraState = sceneMatcher.getCameraState()
      onCameraUpdate(cameraState)
    }
  }, 200)
}

const onCameraUpdate = (cameraState) => {
  if (!object3DLayer || !map) return
  const zoom = cameraState.zoom
  const altScale = transformer.altitudeScale(zoom)

  droneMarkers3D.forEach(marker => {
    if (marker._baseAltitude !== undefined) {
      marker.setHeight(marker._baseAltitude * altScale)
    }
  })

  nestMarkers3D.forEach(marker => {
    if (marker._baseHeight !== undefined) {
      marker.setHeight(marker._baseHeight * altScale)
    }
  })

  flightPaths3D.forEach(path => {
    if (path._baseHeights) {
      const scaledHeights = path._baseHeights.map(h => h * altScale)
      path.setHeight(scaledHeights)
    }
  })
}

const setViewMode = (mode) => {
  viewMode.value = mode
  if (map) {
    map.setViewMode(mode)
    if (mode === '3D') {
      map.setPitch(pitch.value, true, 500)
      map.addControl(new AMap.ControlBar({
        showZoomBar: true,
        showControlButton: true,
        position: 'RT'
      }))
    }
  }
}

const updatePitch = (value) => {
  if (map && viewMode.value === '3D') {
    map.setPitch(value, true, 300)
  }
}

const updateRotation = (value) => {
  if (map && viewMode.value === '3D') {
    map.setRotation(value, true, 300)
  }
}

const safeLngLat = (entity) => {
  const lng = Number(entity.position?.lng ?? entity.longitude ?? entity.lng ?? 0)
  const lat = Number(entity.position?.lat ?? entity.latitude ?? entity.lat ?? 0)
  const alt = Number(entity.position?.altitude ?? entity.altitude ?? 0)
  return { lng, lat, altitude: alt, valid: !isNaN(lng) && !isNaN(lat) && lng !== 0 && lat !== 0 }
}

const renderDrones3D = () => {
  clearDroneMarkers3D()
  clearDroneLabelOverlays()
  if (!object3DLayer || !props.drones.length) return

  const zoom = map ? map.getZoom() : 13
  const altScale = transformer ? transformer.altitudeScale(zoom) : 1

  props.drones.forEach(drone => {
    const coord = safeLngLat(drone)
    if (!coord.valid) return

    const validation = transformer.validateCoordinate(coord.lng, coord.lat, coord.altitude)
    if (!validation.valid) {
      console.warn(`无人机 ${drone.drone_id} 坐标无效:`, validation.errors)
      return
    }

    if (sceneMatcher) {
      sceneMatcher.registerEntity(drone.drone_id, 'drone', coord)
    }

    const drone3D = new AMap.Object3D.Round()
    drone3D.setCenter(new AMap.LngLat(coord.lng, coord.lat))
    drone3D.setRadius(25)
    const displayAlt = Math.max(20, coord.altitude || 80)
    drone3D.setHeight(displayAlt * altScale)
    drone3D._baseAltitude = displayAlt

    const color = DRONE_STATUS_COLORS[drone.status] ?? DRONE_STATUS_COLORS[0]
    drone3D.setColor(color)
    drone3D.droneData = drone
    object3DLayer.add(drone3D)
    droneMarkers3D.push(drone3D)

    const labelContent = `
      <div style="
        background: rgba(10,22,40,0.85);
        color: #fff;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid ${color}60;
        white-space: nowrap;
        pointer-events: none;
      ">
        ${drone.drone_id}
        <span style="color:${color}; margin-left:4px;">${drone.battery?.current?.toFixed(0) ?? '--'}%</span>
      </div>
    `
    const label = new AMap.Marker({
      position: new AMap.LngLat(coord.lng, coord.lat),
      content: labelContent,
      offset: new AMap.Pixel(-30, -25),
      zIndex: 130
    })
    map.add(label)
    droneLabelOverlays.push(label)
  })
}

const renderNests3D = () => {
  clearNestMarkers3D()
  clearNestLabelOverlays()
  if (!object3DLayer || !props.nests.length) return

  const zoom = map ? map.getZoom() : 13
  const altScale = transformer ? transformer.altitudeScale(zoom) : 1

  props.nests.forEach(nest => {
    const coord = safeLngLat(nest)
    if (!coord.valid) return

    const validation = transformer.validateCoordinate(coord.lng, coord.lat, 0)
    if (!validation.valid) {
      console.warn(`机巢 ${nest.nest_id} 坐标无效:`, validation.errors)
      return
    }

    if (sceneMatcher) {
      sceneMatcher.registerEntity(nest.nest_id, 'nest', { ...coord, altitude: 0 })
    }

    const nestSize = 0.0008
    const nest3D = new AMap.Object3D.Prism({
      bounds: new AMap.Bounds(
        [coord.lng - nestSize, coord.lat - nestSize],
        [coord.lng + nestSize, coord.lat + nestSize]
      ),
      height: 40 * altScale,
      color: NEST_STATUS_COLORS[nest.status] ?? NEST_STATUS_COLORS[1],
      topColor: '#4ecdc4',
      sideColor: '#2d9a8c'
    })
    nest3D._baseHeight = 40
    nest3D.nestData = nest
    object3DLayer.add(nest3D)
    nestMarkers3D.push(nest3D)

    const availableSlots = nest.available_slots ?? (nest.max_drones - nest.current_charging)
    const labelContent = `
      <div style="
        background: rgba(10,22,40,0.85);
        color: #fff;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid #4ecdc460;
        white-space: nowrap;
        pointer-events: none;
      ">
        ${nest.nest_name || nest.nest_id}
        <span style="color:#4ecdc4; margin-left:4px;">槽位:${availableSlots}</span>
      </div>
    `
    const label = new AMap.Marker({
      position: new AMap.LngLat(coord.lng, coord.lat),
      content: labelContent,
      offset: new AMap.Pixel(-30, -20),
      zIndex: 120
    })
    map.add(label)
    nestLabelOverlays.push(label)
  })
}

const renderFlightPaths3D = () => {
  clearFlightPaths3D()
  if (!object3DLayer) return

  const zoom = map ? map.getZoom() : 13
  const altScale = transformer ? transformer.altitudeScale(zoom) : 1
  const paths = props.plannedPaths.length > 0 ? props.plannedPaths : props.matchings

  paths.forEach(matching => {
    let startCoord, endCoord

    if (matching.waypoints && matching.waypoints.length >= 2) {
      const wp = matching.waypoints
      const s = wp[0].position || wp[0]
      const e = wp[wp.length - 1].position || wp[wp.length - 1]
      startCoord = { lng: s.lng ?? s.lon, lat: s.lat, altitude: s.altitude ?? 80 }
      endCoord = { lng: e.lng ?? e.lon, lat: e.lat, altitude: e.altitude ?? 50 }
    } else {
      const drone = props.drones.find(d => d.drone_id === matching.drone_id)
      const nest = props.nests.find(n => n.nest_id === matching.nest_id)
      if (!drone || !nest) return
      startCoord = safeLngLat(drone)
      endCoord = safeLngLat(nest)
      endCoord.altitude = 0
    }

    if (!startCoord || !endCoord || !startCoord.valid || !endCoord.valid) return

    const path3D = new AMap.Object3D.Line()
    path3D.setPath([
      new AMap.LngLat(startCoord.lng, startCoord.lat),
      new AMap.LngLat(endCoord.lng, endCoord.lat)
    ])
    const startH = Math.max(20, startCoord.altitude || 80) * altScale
    const endH = Math.max(10, endCoord.altitude || 0) * altScale
    path3D.setHeight([startH, endH])
    path3D._baseHeights = [
      Math.max(20, startCoord.altitude || 80),
      Math.max(10, endCoord.altitude || 0)
    ]
    path3D.setColor('#ff9800')
    path3D.setStrokeWeight(3)
    object3DLayer.add(path3D)
    flightPaths3D.push(path3D)
  })
}

const renderBuildings3D = () => {
  clearBuilding3Ds()
  if (!object3DLayer || !props.buildings.length) return

  const zoom = map ? map.getZoom() : 13
  const altScale = transformer ? transformer.altitudeScale(zoom) : 1

  props.buildings.forEach(building => {
    const coord = safeLngLat(building)
    if (!coord.valid) return

    const building3D = new AMap.Object3D.Prism({
      bounds: new AMap.Bounds(
        [coord.lng - 0.0005, coord.lat - 0.0005],
        [coord.lng + 0.0005, coord.lat + 0.0005]
      ),
      height: (building.height || 80) * altScale,
      color: '#96ceb4',
      topColor: '#7ab89a',
      sideColor: '#5a9878'
    })
    object3DLayer.add(building3D)
    building3Ds.push(building3D)
  })
}

const verifyMatchAccuracy = () => {
  if (!sceneMatcher || !transformer) {
    accuracyResult.value = { allPassed: false, maxError: Infinity }
    return
  }

  const results = sceneMatcher.verifyAllEntities()
  const allPassed = results.every(r => r.passed)
  const maxError = results.length > 0
    ? Math.max(...results.map(r => Math.max(r.positionError, r.altitudeError)))
    : 0

  accuracyResult.value = { allPassed, maxError, details: results }
  emit('accuracy-verified', accuracyResult.value)
}

const clearDroneMarkers3D = () => {
  droneMarkers3D.forEach(m => { if (object3DLayer) object3DLayer.remove(m) })
  droneMarkers3D = []
}

const clearNestMarkers3D = () => {
  nestMarkers3D.forEach(m => { if (object3DLayer) object3DLayer.remove(m) })
  nestMarkers3D = []
}

const clearFlightPaths3D = () => {
  flightPaths3D.forEach(p => { if (object3DLayer) object3DLayer.remove(p) })
  flightPaths3D = []
}

const clearBuilding3Ds = () => {
  building3Ds.forEach(b => { if (object3DLayer) object3DLayer.remove(b) })
  building3Ds = []
}

const clearDroneLabelOverlays = () => {
  droneLabelOverlays.forEach(l => { if (map) map.remove(l) })
  droneLabelOverlays = []
}

const clearNestLabelOverlays = () => {
  nestLabelOverlays.forEach(l => { if (map) map.remove(l) })
  nestLabelOverlays = []
}

const renderAll = () => {
  renderDrones3D()
  renderNests3D()
  renderFlightPaths3D()
  renderBuildings3D()
}

watch(() => props.drones, renderDrones3D, { deep: true })
watch(() => props.nests, renderNests3D, { deep: true })
watch(() => props.matchings, renderFlightPaths3D, { deep: true })
watch(() => props.buildings, renderBuildings3D, { deep: true })
watch(() => props.plannedPaths, renderFlightPaths3D, { deep: true })

onMounted(() => {
  initMap()
})

onUnmounted(() => {
  if (syncTimer) clearInterval(syncTimer)
  if (sceneMatcher) sceneMatcher.destroy()
  if (map) map.destroy()
  map = null
  transformer = null
  sceneMatcher = null
})

defineExpose({
  map,
  setViewMode,
  updatePitch,
  updateRotation,
  renderDrones3D,
  renderNests3D,
  renderFlightPaths3D,
  renderAll,
  verifyMatchAccuracy,
  getTransformer: () => transformer,
  getSceneMatcher: () => sceneMatcher
})
</script>

<style scoped>
.map-3d-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.map-controls {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 100;
  display: flex;
  align-items: center;
  background: rgba(26, 26, 46, 0.92);
  padding: 8px 14px;
  border-radius: 8px;
  gap: 4px;
}

.map-wrapper {
  width: 100%;
  height: 100%;
}

.map-legend {
  position: absolute;
  bottom: 20px;
  left: 10px;
  z-index: 100;
  background: rgba(26, 26, 46, 0.92);
  padding: 12px 14px;
  border-radius: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  color: #fff;
  font-size: 12px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-right: 8px;
}

.coord-debug {
  position: absolute;
  bottom: 20px;
  right: 10px;
  z-index: 100;
  background: rgba(26, 26, 46, 0.92);
  padding: 10px 14px;
  border-radius: 8px;
  max-width: 320px;
  font-size: 11px;
  color: #ccc;
}

.debug-title {
  color: #fff;
  font-weight: bold;
  margin-bottom: 6px;
}

.debug-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.debug-id {
  color: #4ecdc4;
  min-width: 50px;
}

.debug-coord {
  color: #aaa;
}

.debug-alt {
  color: #888;
}

.debug-status.ok {
  color: #00e676;
}

.debug-status.err {
  color: #ff5252;
}
</style>
