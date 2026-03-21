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
      
      <el-slider
        v-model="pitch"
        :min="0"
        :max="80"
        :step="5"
        label="俯仰角"
        style="width: 200px; margin-left: 20px;"
        @change="updatePitch"
      />
      
      <el-slider
        v-model="rotation"
        :min="0"
        :max="360"
        :step="10"
        label="旋转角"
        style="width: 200px; margin-left: 20px;"
        @change="updateRotation"
      />
    </div>
    
    <div id="map-3d" class="map-wrapper"></div>
    
    <div class="map-legend">
      <div class="legend-item">
        <span class="legend-color" style="background: #ff6b6b;"></span>
        <span>无人机</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #4ecdc4;"></span>
        <span>充电机槽</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #45b7d1;"></span>
        <span>飞行路径</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background: #96ceb4;"></span>
        <span>建筑</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { AMAP_CONFIG, MAP_CENTER } from '@/utils/amap'

const viewMode = ref('3D')
const pitch = ref(45)
const rotation = ref(0)

let map = null
let object3DLayer = null
let droneMarkers3D = []
let nestMarkers3D = []
let flightPaths3D = []
let building3Ds = []

const props = defineProps({
  drones: {
    type: Array,
    default: () => []
  },
  nests: {
    type: Array,
    default: () => []
  },
  matchings: {
    type: Array,
    default: () => []
  },
  buildings: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['map-ready', 'marker-click'])

const initMap = () => {
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
  map.addControl(new AMap.ToolBar({
    position: 'RB'
  }))
  
  if (viewMode.value === '3D') {
    map.addControl(new AMap.ControlBar({
      showZoomBar: true,
      showControlButton: true,
      position: 'RT'
    }))
  }
  
  object3DLayer = new AMap.Object3DLayer({
    zIndex: 10,
    opacity: 1
  })
  map.add(object3DLayer)
  
  emit('map-ready', map)
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

const renderDrones3D = () => {
  clearDroneMarkers3D()
  
  if (!object3DLayer || !props.drones.length) return
  
  props.drones.forEach(drone => {
    const drone3D = new AMap.Object3D.Round()
    
    const position = drone.position || drone
    const altitude = position.altitude || 100
    
    drone3D.setCenter(new AMap.LngLat(position.lon || position[0], position.lat || position[1]))
    drone3D.setRadius(30)
    drone3D.setHeight(altitude)
    
    const color = getDroneColor(drone.status)
    drone3D.setColor(color)
    
    drone3D.droneData = drone
    object3DLayer.add(drone3D)
    droneMarkers3D.push(drone3D)
  })
}

const renderNests3D = () => {
  clearNestMarkers3D()
  
  if (!object3DLayer || !props.nests.length) return
  
  props.nests.forEach(nest => {
    const nest3D = new AMap.Object3D.Prism({
      bounds: new AMap.Bounds(
        [nest.position.lon - 0.001, nest.position.lat - 0.001],
        [nest.position.lon + 0.001, nest.position.lat + 0.001]
      ),
      height: 50,
      color: getNestColor(nest.status),
      topColor: '#4ecdc4',
      sideColor: '#2d9a8c'
    })
    
    nest3D.nestData = nest
    object3DLayer.add(nest3D)
    nestMarkers3D.push(nest3D)
  })
}

const renderFlightPaths3D = () => {
  clearFlightPaths3D()
  
  if (!object3DLayer || !props.matchings.length) return
  
  props.matchings.forEach(matching => {
    const drone = props.drones.find(d => d.id === matching.drone_id)
    const nest = props.nests.find(n => n.id === matching.nest_id)
    
    if (drone && nest) {
      const path = new AMap.Object3D.Line()
      
      const startCoord = new AMap.LngLat(drone.position.lon, drone.position.lat)
      const endCoord = new AMap.LngLat(nest.position.lon, nest.position.lat)
      
      path.setPath([startCoord, endCoord])
      path.setHeight([drone.position.altitude || 100, 50])
      path.setColor('#45b7d1')
      path.setStrokeWeight(3)
      
      object3DLayer.add(path)
      flightPaths3D.push(path)
    }
  })
}

const renderBuildings3D = () => {
  clearBuilding3Ds()
  
  if (!object3DLayer || !props.buildings.length) return
  
  props.buildings.forEach(building => {
    const building3D = new AMap.Object3D.Prism({
      bounds: new AMap.Bounds(
        [building.position.lon - 0.0005, building.position.lat - 0.0005],
        [building.position.lon + 0.0005, building.position.lat + 0.0005]
      ),
      height: building.height || 80,
      color: '#96ceb4',
      topColor: '#7ab89a',
      sideColor: '#5a9878'
    })
    
    object3DLayer.add(building3D)
    building3Ds.push(building3D)
  })
}

const getDroneColor = (status) => {
  const colors = {
    'idle': '#00e676',
    'flying': '#ff6b6b',
    'charging': '#ffab00',
    'on_mission': '#29b6f6',
    'returning': '#ab47bc',
    'emergency': '#ff5252'
  }
  return colors[status] || '#ff6b6b'
}

const getNestColor = (status) => {
  const colors = {
    'available': '#4ecdc4',
    'full': '#ffab00',
    'maintenance': '#9e9e9e',
    'offline': '#5a7aa3'
  }
  return colors[status] || '#4ecdc4'
}

const clearDroneMarkers3D = () => {
  droneMarkers3D.forEach(marker => {
    if (object3DLayer) {
      object3DLayer.remove(marker)
    }
  })
  droneMarkers3D = []
}

const clearNestMarkers3D = () => {
  nestMarkers3D.forEach(marker => {
    if (object3DLayer) {
      object3DLayer.remove(marker)
    }
  })
  nestMarkers3D = []
}

const clearFlightPaths3D = () => {
  flightPaths3D.forEach(path => {
    if (object3DLayer) {
      object3DLayer.remove(path)
    }
  })
  flightPaths3D = []
}

const clearBuilding3Ds = () => {
  building3Ds.forEach(building => {
    if (object3DLayer) {
      object3DLayer.remove(building)
    }
  })
  building3Ds = []
}

watch(() => props.drones, renderDrones3D, { deep: true })
watch(() => props.nests, renderNests3D, { deep: true })
watch(() => props.matchings, renderFlightPaths3D, { deep: true })
watch(() => props.buildings, renderBuildings3D, { deep: true })

onMounted(() => {
  initMap()
})

onUnmounted(() => {
  if (map) {
    map.destroy()
  }
})

defineExpose({
  map,
  setViewMode,
  updatePitch,
  updateRotation,
  renderDrones3D,
  renderNests3D,
  renderFlightPaths3D,
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
  background: rgba(26, 26, 46, 0.9);
  padding: 10px 15px;
  border-radius: 8px;
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
  background: rgba(26, 26, 46, 0.9);
  padding: 15px;
  border-radius: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  color: #fff;
  font-size: 12px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-right: 8px;
}
</style>
