<template>
  <div class="nests-page">
    <div class="page-header">
      <div class="header-left">
        <h1>机巢管理</h1>
        <p>管理所有充电机巢设备</p>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          添加机巢
        </el-button>
      </div>
    </div>
    
    <div class="stats-cards">
      <div class="stat-card" v-for="stat in nestStats" :key="stat.key">
        <div class="stat-icon" :style="{ background: stat.gradient }">
          <el-icon><component :is="stat.icon" /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </div>
      </div>
    </div>
    
    <div class="filter-bar">
      <div class="filter-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索机巢ID/名称"
          prefix-icon="Search"
          clearable
          style="width: 240px"
        />
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px">
          <el-option label="离线" value="0" />
          <el-option label="空闲" value="1" />
          <el-option label="占用" value="2" />
          <el-option label="故障" value="3" />
        </el-select>
        <el-select v-model="filterPower" placeholder="充电功率" clearable style="width: 140px">
          <el-option label="1500W" value="1500" />
          <el-option label="1800W" value="1800" />
          <el-option label="2000W" value="2000" />
        </el-select>
      </div>
      <div class="filter-right">
        <el-button @click="refreshList">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>
    
    <div class="nests-grid">
      <div
        class="nest-card"
        v-for="nest in filteredNests"
        :key="nest.nest_id"
        :class="getStatusClass(nest.status)"
        @click="showNestDetail(nest)"
      >
        <div class="nest-header">
          <div class="nest-id">{{ nest.nest_id }}</div>
          <span class="status-badge" :class="getStatusClass(nest.status)">
            {{ getNestStatusText(nest.status) }}
          </span>
        </div>
        
        <div class="nest-body">
          <div class="nest-info">
            <div class="info-item">
              <el-icon><Location /></el-icon>
              <span>{{ nest.location || '116.407, 39.904' }}</span>
            </div>
            <div class="info-item">
              <el-icon><Lightning /></el-icon>
              <span>{{ nest.charge_power }}W</span>
            </div>
          </div>
          
          <div class="nest-stats">
            <div class="stat">
              <div class="stat-label">今日充电</div>
              <div class="stat-value">{{ nest.today_charges || 0 }}次</div>
            </div>
            <div class="stat">
              <div class="stat-label">累计时长</div>
              <div class="stat-value">{{ nest.total_duration || 0 }}h</div>
            </div>
          </div>
        </div>
        
        <div class="nest-footer">
          <div class="current-drone" v-if="nest.current_drone">
            <el-icon><Position /></el-icon>
            <span>{{ nest.current_drone }}</span>
          </div>
          <div class="current-drone empty" v-else>
            <span>暂无设备充电</span>
          </div>
          <div class="update-time">
            {{ formatDateTime(nest.update_time) }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- 地图选点对话框 -->
    <el-dialog
      v-model="showMapDialog"
      title="选择机巢位置"
      width="700px"
      destroy-on-close
      @open="initPickerMap"
      @close="destroyPickerMap"
    >
      <div class="map-picker-container">
        <div class="map-picker-search">
          <el-input
            v-model="mapSearchKeyword"
            placeholder="搜索地址"
            clearable
            @keyup.enter="searchAddress"
          >
            <template #append>
              <el-button @click="searchAddress">搜索</el-button>
            </template>
          </el-input>
        </div>
        <div ref="mapPickerRef" class="map-picker-map"></div>
        <div class="map-picker-result" v-if="pickedLocation">
          <el-icon><Location /></el-icon>
          <span>已选坐标：{{ pickedLocation.lng.toFixed(6) }}, {{ pickedLocation.lat.toFixed(6) }}</span>
        </div>
        <div class="map-picker-tip" v-else>点击地图选择机巢位置</div>
      </div>
      <template #footer>
        <el-button @click="showMapDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!pickedLocation" @click="confirmLocation">确认位置</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showAddDialog"
      :title="editingNest ? '编辑机巢' : '添加机巢'"
      width="500px"
      destroy-on-close
    >
      <el-form
        ref="nestFormRef"
        :model="nestForm"
        :rules="nestRules"
        label-width="100px"
      >
        <el-form-item label="机巢ID" prop="nest_id">
          <el-input
            v-model="nestForm.nest_id"
            placeholder="请输入机巢ID"
            :disabled="!!editingNest"
          />
        </el-form-item>
        <el-form-item label="机巢名称" prop="nest_name">
          <el-input v-model="nestForm.nest_name" placeholder="请输入机巢名称" />
        </el-form-item>
        <el-form-item label="位置坐标" prop="location">
          <el-input v-model="nestForm.location" placeholder="格式：经度,纬度">
            <template #append>
              <el-button @click="selectLocation">选择位置</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="充电功率" prop="charge_power">
          <el-select v-model="nestForm.charge_power" style="width: 100%">
            <el-option label="1500W" :value="1500" />
            <el-option label="1800W" :value="1800" />
            <el-option label="2000W" :value="2000" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitNest">
          确定
        </el-button>
      </template>
    </el-dialog>
    
    <el-drawer
      v-model="showDetailDrawer"
      :title="currentNest?.nest_id"
      size="400px"
    >
      <div class="nest-detail" v-if="currentNest">
        <div class="detail-header">
          <div class="detail-status" :class="getStatusClass(currentNest.status)">
            {{ getNestStatusText(currentNest.status) }}
          </div>
          <div class="detail-power">
            <el-icon><Lightning /></el-icon>
            <span>{{ currentNest.charge_power }}W</span>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>基本信息</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">机巢名称</span>
              <span class="value">{{ currentNest.nest_name || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">位置坐标</span>
              <span class="value">{{ currentNest.location || '116.407, 39.904' }}</span>
            </div>
            <div class="info-item">
              <span class="label">上线时间</span>
              <span class="value">{{ formatDateTime(currentNest.online_time) }}</span>
            </div>
            <div class="info-item">
              <span class="label">创建时间</span>
              <span class="value">{{ formatDateTime(currentNest.create_time) }}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>运行统计</h4>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-value">{{ currentNest.today_charges || 0 }}</div>
              <div class="stat-label">今日充电次数</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">{{ currentNest.total_duration || 0 }}h</div>
              <div class="stat-label">累计运行时长</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">{{ currentNest.utilization_rate || 0 }}%</div>
              <div class="stat-label">利用率</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">{{ currentNest.fault_count || 0 }}</div>
              <div class="stat-label">故障次数</div>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>当前充电</h4>
          <div class="charging-info" v-if="currentNest.status === 2 && currentNest.current_charging_info">
            <div class="drone-info">
              <el-icon><Position /></el-icon>
              <span>{{ currentNest.current_charging_info.drone_id }}</span>
            </div>
            <div class="charging-progress">
              <el-progress :percentage="calcChargingProgress(currentNest.current_charging_info)" :stroke-width="8" />
              <div class="progress-text">
                <span>电量：{{ currentNest.current_charging_info.current_battery }}%</span>
                <span>预计剩余：{{ calcEstimatedTime(currentNest.current_charging_info) }}分钟</span>
              </div>
            </div>
          </div>
          <div class="no-charging" v-else>
            <el-icon><Warning /></el-icon>
            <span>当前无设备充电</span>
          </div>
        </div>
        
        <div class="detail-actions">
          <el-button type="primary" @click="editNest(currentNest)">
            <el-icon><Edit /></el-icon>
            编辑
          </el-button>
          <el-button type="warning" @click="showStatusDialog = true">
            <el-icon><SwitchButton /></el-icon>
            状态管理
          </el-button>
          <el-button type="danger" @click="deleteNestConfirm(currentNest)">
            <el-icon><Delete /></el-icon>
            删除
          </el-button>
        </div>
        
        <!-- 状态管理对话框 -->
        <el-dialog
          v-model="showStatusDialog"
          title="机巢状态管理"
          width="400px"
          destroy-on-close
        >
          <div class="status-management">
            <div class="status-item">
              <span class="status-label">当前状态</span>
              <span class="status-value" :class="getStatusClass(currentNest.status)">
                {{ getNestStatusText(currentNest.status) }}
              </span>
            </div>
            <el-form-item label="目标状态">
              <el-select v-model="targetStatus" style="width: 100%">
                <el-option label="离线" value="0" />
                <el-option label="空闲" value="1" />
                <el-option label="占用" value="2" />
                <el-option label="故障" value="3" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="targetStatus === '2'" label="占用无人机">
              <el-select v-model="occupiedDrone" placeholder="选择无人机" style="width: 100%">
                <el-option
                  v-for="drone in droneStore.drones"
                  :key="drone.drone_id"
                  :label="`${drone.drone_id} - ${getDroneTypeText(drone.drone_type)}`"
                  :value="drone.drone_id"
                />
              </el-select>
            </el-form-item>
          </div>
          <template #footer>
            <el-button @click="showStatusDialog = false">取消</el-button>
            <el-button type="primary" @click="updateNestStatus">确认修改</el-button>
          </template>
        </el-dialog>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNestStore } from '@/store/nest'
import { useDroneStore } from '@/store/drone'
import { formatDateTime, getNestStatusText, getDroneTypeText } from '@/utils'
import { AMAP_CONFIG, MAP_CENTER } from '@/utils/amap'

const nestStore = useNestStore()
const droneStore = useDroneStore()

const searchKeyword = ref('')
const filterStatus = ref('')
const filterPower = ref('')
const showAddDialog = ref(false)
const showDetailDrawer = ref(false)
const editingNest = ref(null)
const currentNest = ref(null)
const submitting = ref(false)
const nestFormRef = ref(null)

// 状态管理
const showStatusDialog = ref(false)
const targetStatus = ref('')
const occupiedDrone = ref('')

const nestForm = reactive({
  nest_id: '',
  nest_name: '',
  location: '',
  longitude: null,
  latitude: null,
  charge_power: 1500
})

const nestRules = {
  nest_id: [
    { required: true, message: '请输入机巢ID', trigger: 'blur' },
    { pattern: /^NT\d{3,}$/, message: '格式：NT开头+3位以上数字', trigger: 'blur' }
  ],
  nest_name: [{ required: true, message: '请输入机巢名称', trigger: 'blur' }],
  location: [{ required: true, message: '请输入位置坐标', trigger: 'blur' }],
  charge_power: [{ required: true, message: '请选择充电功率', trigger: 'change' }]
}

const nestStats = computed(() => [
  {
    key: 'total',
    label: '总机巢数',
    value: nestStore.totalCount,
    icon: 'OfficeBuilding',
    gradient: 'linear-gradient(135deg, #00d4ff, #0099cc)'
  },
  {
    key: 'online',
    label: '在线数',
    value: nestStore.onlineNests.length,
    icon: 'Connection',
    gradient: 'linear-gradient(135deg, #00e676, #00c853)'
  },
  {
    key: 'available',
    label: '空闲数',
    value: nestStore.availableNests.length,
    icon: 'CircleCheck',
    gradient: 'linear-gradient(135deg, #29b6f6, #0288d1)'
  },
  {
    key: 'fault',
    label: '故障数',
    value: nestStore.faultNests.length,
    icon: 'Warning',
    gradient: 'linear-gradient(135deg, #ff5252, #d32f2f)'
  }
])

const filteredNests = computed(() => {
  let result = nestStore.nests
  if (searchKeyword.value) {
    result = result.filter(n =>
      n.nest_id.includes(searchKeyword.value) ||
      n.nest_name?.includes(searchKeyword.value)
    )
  }
  if (filterStatus.value !== '') {
    result = result.filter(n => n.status === Number(filterStatus.value))
  }
  if (filterPower.value) {
    result = result.filter(n => n.charge_power === Number(filterPower.value))
  }
  return result
})

const getStatusClass = (status) => {
  const classes = { 0: 'offline', 1: 'idle', 2: 'occupied', 3: 'fault' }
  return classes[status] || ''
}

const refreshList = () => {
  nestStore.fetchNests()
  ElMessage.success('列表已刷新')
}

const showNestDetail = async (nest) => {
  try {
    const detail = await nestStore.fetchNestById(nest.nest_id)
    currentNest.value = detail || nest
  } catch {
    currentNest.value = nest
  }
  showDetailDrawer.value = true
  targetStatus.value = nest.status.toString()
  occupiedDrone.value = nest.current_drone || ''
}

const calcChargingProgress = (info) => {
  if (!info) return 0
  const start = info.start_battery || 0
  const current = info.current_battery || 0
  if (start >= 100) return 100
  return Math.min(100, Math.round(((current - start) / (100 - start)) * 100))
}

const calcEstimatedTime = (info) => {
  if (!info) return 0
  const current = info.current_battery || 0
  const remaining = 100 - current
  const power = info.charge_power || 1500
  const rate = power / 1500
  return Math.ceil(remaining * 0.5 / rate)
}

const updateNestStatus = async () => {
  if (!currentNest.value) return
  
  try {
    const statusData = {
      status: Number(targetStatus.value),
      current_drone: targetStatus.value === '2' ? occupiedDrone.value : null
    }
    
    await nestStore.updateNest(currentNest.value.nest_id, statusData)
    
    // 更新本地状态
    currentNest.value.status = Number(targetStatus.value)
    currentNest.value.current_drone = statusData.current_drone
    
    ElMessage.success('状态更新成功')
    showStatusDialog.value = false
  } catch (error) {
    ElMessage.error('状态更新失败')
  }
}

const selectLocation = () => {
  showMapDialog.value = true
}

const showMapDialog = ref(false)
const mapPickerRef = ref(null)
const mapSearchKeyword = ref('')
const pickedLocation = ref(null)
let pickerMap = null
let pickerMarker = null
let geocoder = null
let placeSearch = null

const initPickerMap = async () => {
  await nextTick()
  if (!mapPickerRef.value) return

  // 解析当前表单中已有坐标作为初始中心
  let center = MAP_CENTER
  if (nestForm.location) {
    const parts = nestForm.location.split(',').map(s => parseFloat(s.trim()))
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      center = parts
      pickedLocation.value = { lng: parts[0], lat: parts[1] }
    }
  }

  pickerMap = new AMap.Map(mapPickerRef.value, {
    zoom: 13,
    center,
    mapStyle: 'amap://styles/dark',
    viewMode: '2D'
  })

  // 若已有坐标，显示初始标记
  if (pickedLocation.value) {
    pickerMarker = new AMap.Marker({ position: center, map: pickerMap })
  }

  AMap.plugin(['AMap.Geocoder', 'AMap.PlaceSearch'], () => {
    geocoder = new AMap.Geocoder({ city: '合肥' })
    placeSearch = new AMap.PlaceSearch({ city: '合肥', map: pickerMap })
  })

  pickerMap.on('click', (e) => {
    const { lng, lat } = e.lnglat
    pickedLocation.value = { lng, lat }

    if (pickerMarker) {
      pickerMarker.setPosition([lng, lat])
    } else {
      pickerMarker = new AMap.Marker({ position: [lng, lat], map: pickerMap })
    }
  })
}

const destroyPickerMap = () => {
  if (pickerMap) {
    pickerMap.destroy()
    pickerMap = null
    pickerMarker = null
    geocoder = null
    placeSearch = null
  }
  pickedLocation.value = null
  mapSearchKeyword.value = ''
}

const searchAddress = () => {
  if (!mapSearchKeyword.value || !placeSearch) return
  placeSearch.search(mapSearchKeyword.value, (status, result) => {
    if (status === 'complete' && result.poiList?.pois?.length > 0) {
      const poi = result.poiList.pois[0]
      const { lng, lat } = poi.location
      pickedLocation.value = { lng, lat }
      pickerMap.setCenter([lng, lat])
      if (pickerMarker) {
        pickerMarker.setPosition([lng, lat])
      } else {
        pickerMarker = new AMap.Marker({ position: [lng, lat], map: pickerMap })
      }
    } else {
      ElMessage.warning('未找到相关地址')
    }
  })
}

const confirmLocation = () => {
  if (!pickedLocation.value) return
  const { lng, lat } = pickedLocation.value
  nestForm.location = `${lng.toFixed(6)},${lat.toFixed(6)}`
  nestForm.longitude = lng
  nestForm.latitude = lat
  showMapDialog.value = false
  ElMessage.success('位置已选择')
}

const editNest = (nest) => {
  editingNest.value = nest
  Object.assign(nestForm, {
    nest_id: nest.nest_id,
    nest_name: nest.nest_name,
    location: nest.location || '',
    longitude: nest.longitude || null,
    latitude: nest.latitude || null,
    charge_power: nest.charge_power
  })
  showDetailDrawer.value = false
  showAddDialog.value = true
}

const submitNest = async () => {
  if (!nestFormRef.value) return
  
  await nestFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    submitting.value = true
    try {
      if (editingNest.value) {
        await nestStore.updateNest(nestForm.nest_id, nestForm)
        ElMessage.success('更新成功')
      } else {
        await nestStore.createNest(nestForm)
        ElMessage.success('添加成功')
      }
      showAddDialog.value = false
      resetForm()
    } catch (error) {
      ElMessage.error('操作失败')
    } finally {
      submitting.value = false
    }
  })
}

const resetForm = () => {
  editingNest.value = null
  Object.assign(nestForm, {
    nest_id: '',
    nest_name: '',
    location: '',
    longitude: null,
    latitude: null,
    charge_power: 1500
  })
}

const resetNest = () => {
  ElMessageBox.confirm('确定要重置该机巢吗？', '重置确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    ElMessage.success('机巢已重置')
  }).catch(() => {})
}

const deleteNestConfirm = (nest) => {
  ElMessageBox.confirm(
    `确定要删除机巢 ${nest.nest_id} 吗？`,
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await nestStore.deleteNest(nest.nest_id)
      ElMessage.success('删除成功')
      showDetailDrawer.value = false
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

let refreshTimer = null

onMounted(() => {
  nestStore.fetchNests()
  refreshTimer = setInterval(() => {
    nestStore.fetchNests()
  }, 30000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="scss" scoped>
.nests-page {
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

.stats-cards {
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
    transition: all $transition-fast;
    
    &:hover {
      border-color: $primary-color;
      transform: translateY(-2px);
    }
    
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

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  
  .filter-left {
    display: flex;
    gap: 12px;
  }
}

.nests-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.nest-card {
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  padding: 16px;
  cursor: pointer;
  transition: all $transition-fast;
  
  &:hover {
    border-color: $primary-color;
    box-shadow: $shadow-glow;
  }
  
  &.offline {
    opacity: 0.7;
  }
  
  &.fault {
    border-color: rgba($danger-color, 0.5);
    
    .nest-header .nest-id {
      color: $danger-color;
    }
  }
  
  .nest-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    
    .nest-id {
      font-size: 16px;
      font-weight: 600;
      color: $text-primary;
    }
    
    .status-badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      
      &.offline {
        background: rgba($text-muted, 0.15);
        color: $text-muted;
      }
      
      &.idle {
        background: rgba($success-color, 0.15);
        color: $success-color;
      }
      
      &.occupied {
        background: rgba($warning-color, 0.15);
        color: $warning-color;
      }
      
      &.fault {
        background: rgba($danger-color, 0.15);
        color: $danger-color;
      }
    }
  }
  
  .nest-body {
    margin-bottom: 12px;
    
    .nest-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
      
      .info-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: $text-secondary;
        
        .el-icon {
          font-size: 14px;
          color: $text-muted;
        }
      }
    }
    
    .nest-stats {
      display: flex;
      gap: 16px;
      padding-top: 12px;
      border-top: 1px solid $border-color;
      
      .stat {
        .stat-label {
          font-size: 11px;
          color: $text-muted;
        }
        
        .stat-value {
          font-size: 14px;
          font-weight: 600;
          color: $text-primary;
        }
      }
    }
  }
  
  .nest-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid $border-color;
    
    .current-drone {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: $primary-color;
      
      &.empty {
        color: $text-muted;
      }
    }
    
    .update-time {
      font-size: 11px;
      color: $text-muted;
    }
  }
}

.nest-detail {
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid $border-color;
    margin-bottom: 20px;
    
    .detail-status {
      padding: 6px 16px;
      border-radius: 16px;
      font-size: 14px;
      font-weight: 500;
      
      &.offline {
        background: rgba($text-muted, 0.15);
        color: $text-muted;
      }
      
      &.idle {
        background: rgba($success-color, 0.15);
        color: $success-color;
      }
      
      &.occupied {
        background: rgba($warning-color, 0.15);
        color: $warning-color;
      }
      
      &.fault {
        background: rgba($danger-color, 0.15);
        color: $danger-color;
      }
    }
    
    .detail-power {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 16px;
      font-weight: 600;
      color: $warning-color;
    }
  }
  
  .detail-section {
    margin-bottom: 24px;
    
    h4 {
      font-size: 14px;
      font-weight: 600;
      color: $text-primary;
      margin-bottom: 12px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      
      .info-item {
        .label {
          display: block;
          font-size: 12px;
          color: $text-muted;
          margin-bottom: 4px;
        }
        
        .value {
          font-size: 13px;
          color: $text-primary;
        }
      }
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      
      .stat-box {
        background: rgba($bg-darker, 0.5);
        padding: 12px;
        border-radius: 8px;
        text-align: center;
        
        .stat-value {
          font-size: 20px;
          font-weight: 700;
          color: $text-primary;
        }
        
        .stat-label {
          font-size: 11px;
          color: $text-muted;
          margin-top: 4px;
        }
      }
    }
    
    .charging-info {
      background: rgba($bg-darker, 0.5);
      padding: 16px;
      border-radius: 8px;
      
      .drone-info {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        font-size: 14px;
        font-weight: 500;
        color: $primary-color;
      }
      
      .charging-progress {
        .progress-text {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 12px;
          color: $text-secondary;
        }
      }
    }
    
    .no-charging {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
      color: $text-muted;
      
      .el-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }
    }
  }
  
  .detail-actions {
    display: flex;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid $border-color;
  }
}

@media screen and (max-width: $breakpoint-lg) {
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media screen and (max-width: $breakpoint-sm) {
  .nests-page {
    padding: 16px;
  }

  .stats-cards {
    grid-template-columns: 1fr;
  }

  .filter-bar {
    flex-direction: column;
    gap: 12px;

    .filter-left {
      width: 100%;
      flex-wrap: wrap;
    }
  }
}

.map-picker-container {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .map-picker-search {
    display: flex;
    gap: 8px;
  }

  .map-picker-map {
    width: 100%;
    height: 400px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid $border-color;
  }

  .map-picker-result {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: $success-color;
    padding: 6px 10px;
    background: rgba($success-color, 0.08);
    border-radius: 6px;

    .el-icon {
      font-size: 15px;
    }
  }

  .map-picker-tip {
    font-size: 13px;
    color: $text-secondary;
    text-align: center;
    padding: 6px 0;
  }
}
</style>
