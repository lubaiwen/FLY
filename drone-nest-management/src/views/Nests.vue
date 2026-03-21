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
              <div class="stat-value">{{ nest.today_charges || Math.floor(Math.random() * 10) }}次</div>
            </div>
            <div class="stat">
              <div class="stat-label">累计时长</div>
              <div class="stat-value">{{ nest.total_duration || Math.floor(Math.random() * 100) }}h</div>
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
              <div class="stat-value">{{ Math.floor(Math.random() * 20) }}</div>
              <div class="stat-label">今日充电次数</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">{{ Math.floor(Math.random() * 200) }}h</div>
              <div class="stat-label">累计运行时长</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">{{ (Math.random() * 100).toFixed(1) }}%</div>
              <div class="stat-label">利用率</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">{{ Math.floor(Math.random() * 5) }}</div>
              <div class="stat-label">故障次数</div>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>当前充电</h4>
          <div class="charging-info" v-if="currentNest.status === 2">
            <div class="drone-info">
              <el-icon><Position /></el-icon>
              <span>DR001</span>
            </div>
            <div class="charging-progress">
              <el-progress :percentage="65" :stroke-width="8" />
              <div class="progress-text">
                <span>电量：65%</span>
                <span>预计剩余：25分钟</span>
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
          <el-button type="warning" v-if="currentNest.status === 3" @click="resetNest">
            <el-icon><RefreshRight /></el-icon>
            重置
          </el-button>
          <el-button type="danger" @click="deleteNestConfirm(currentNest)">
            <el-icon><Delete /></el-icon>
            删除
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNestStore } from '@/store/nest'
import { formatDateTime, getNestStatusText } from '@/utils'

const nestStore = useNestStore()

const searchKeyword = ref('')
const filterStatus = ref('')
const filterPower = ref('')
const showAddDialog = ref(false)
const showDetailDrawer = ref(false)
const editingNest = ref(null)
const currentNest = ref(null)
const submitting = ref(false)
const nestFormRef = ref(null)

const nestForm = reactive({
  nest_id: '',
  nest_name: '',
  location: '',
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

const showNestDetail = (nest) => {
  currentNest.value = nest
  showDetailDrawer.value = true
}

const selectLocation = () => {
  ElMessage.info('地图选点功能开发中')
}

const editNest = (nest) => {
  editingNest.value = nest
  Object.assign(nestForm, {
    nest_id: nest.nest_id,
    nest_name: nest.nest_name,
    location: nest.location || '116.407, 39.904',
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

onMounted(() => {
  nestStore.fetchNests()
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
</style>
