<template>
  <div class="drones-page">
    <div class="page-header">
      <div class="header-left">
        <h1>无人机管理</h1>
        <p>管理所有无人机设备信息</p>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          添加无人机
        </el-button>
      </div>
    </div>
    
    <div class="filter-bar">
      <div class="filter-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索无人机ID/名称"
          prefix-icon="Search"
          clearable
          style="width: 240px"
          @input="handleSearch"
        />
        <el-select v-model="filterType" placeholder="无人机类型" clearable style="width: 140px">
          <el-option label="固定路线" value="1" />
          <el-option label="周期性" value="2" />
          <el-option label="临时性" value="3" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px">
          <el-option label="待机" value="0" />
          <el-option label="飞行中" value="1" />
          <el-option label="充电中" value="2" />
          <el-option label="维护中" value="3" />
        </el-select>
      </div>
      <div class="filter-right">
        <el-button @click="refreshList">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button @click="exportData">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </div>
    
    <div class="stats-row">
      <div class="stat-item">
        <div class="stat-value">{{ droneStore.totalCount }}</div>
        <div class="stat-label">总数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value online">{{ droneStore.onlineDrones.length }}</div>
        <div class="stat-label">在线</div>
      </div>
      <div class="stat-item">
        <div class="stat-value charging">{{ droneStore.chargingDrones.length }}</div>
        <div class="stat-label">充电中</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ droneStore.dronesByType.fixed.length }}</div>
        <div class="stat-label">固定路线</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ droneStore.dronesByType.periodic.length }}</div>
        <div class="stat-label">周期性</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ droneStore.dronesByType.temporary.length }}</div>
        <div class="stat-label">临时性</div>
      </div>
    </div>
    
    <div class="table-container">
      <el-table
        :data="filteredDrones"
        style="width: 100%"
        row-key="drone_id"
        @row-click="handleRowClick"
      >
        <el-table-column prop="drone_id" label="无人机ID" width="140">
          <template #default="{ row }">
            <div class="drone-id">
              <div class="drone-icon" :class="getDroneTypeClass(row.drone_type)">
                <el-icon><Position /></el-icon>
              </div>
              <span>{{ row.drone_id }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="drone_type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getDroneTypeTag(row.drone_type)" size="small">
              {{ getDroneTypeText(row.drone_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="belong_enterprise" label="所属企业" min-width="140" />
        <el-table-column prop="battery_capacity" label="电池容量" width="100">
          <template #default="{ row }">
            {{ row.battery_capacity }} mAh
          </template>
        </el-table-column>
        <el-table-column prop="current_battery" label="当前电量" width="160">
          <template #default="{ row }">
            <div class="battery-cell">
              <el-progress
                :percentage="row.current_battery"
                :stroke-width="6"
                :color="getBatteryColor(row.current_battery)"
                :show-text="false"
              />
              <span class="battery-text">{{ row.current_battery }}%</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <span class="status-badge" :class="getDroneStatusClass(row.status)">
              {{ getDroneStatusText(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="bind_nest_id" label="绑定机巢" width="120">
          <template #default="{ row }">
            <span v-if="row.bind_nest_id" class="nest-link">
              {{ row.bind_nest_id }}
            </span>
            <span v-else class="unbound">未绑定</span>
          </template>
        </el-table-column>
        <el-table-column prop="update_time" label="更新时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.update_time) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button type="primary" link size="small" @click.stop="editDrone(row)">
                编辑
              </el-button>
              <el-button type="primary" link size="small" @click.stop="bindNest(row)">
                绑定
              </el-button>
              <el-button type="danger" link size="small" @click.stop="deleteDrone(row)">
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="droneStore.totalCount"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </div>
    
    <el-dialog
      v-model="showAddDialog"
      :title="editingDrone ? '编辑无人机' : '添加无人机'"
      width="500px"
      destroy-on-close
    >
      <el-form
        ref="droneFormRef"
        :model="droneForm"
        :rules="droneRules"
        label-width="100px"
      >
        <el-form-item label="无人机ID" prop="drone_id">
          <el-input
            v-model="droneForm.drone_id"
            placeholder="请输入无人机ID"
            :disabled="!!editingDrone"
          />
        </el-form-item>
        <el-form-item label="类型" prop="drone_type">
          <el-select v-model="droneForm.drone_type" placeholder="请选择类型" style="width: 100%">
            <el-option label="固定路线" :value="1" />
            <el-option label="周期性" :value="2" />
            <el-option label="临时性" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属企业" prop="belong_enterprise">
          <el-input v-model="droneForm.belong_enterprise" placeholder="请输入所属企业" />
        </el-form-item>
        <el-form-item label="电池容量" prop="battery_capacity">
          <el-input-number
            v-model="droneForm.battery_capacity"
            :min="1000"
            :max="50000"
            :step="500"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="当前电量" prop="current_battery">
          <el-slider v-model="droneForm.current_battery" :format-tooltip="val => val + '%'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitDrone">
          确定
        </el-button>
      </template>
    </el-dialog>
    
    <el-dialog
      v-model="showBindDialog"
      title="绑定机巢"
      width="400px"
    >
      <div class="bind-content">
        <div class="current-drone">
          <span class="label">当前无人机：</span>
          <span class="value">{{ bindingDrone?.drone_id }}</span>
        </div>
        <el-form-item label="选择机巢">
          <el-select v-model="selectedNestId" placeholder="请选择机巢" style="width: 100%">
            <el-option
              v-for="nest in availableNests"
              :key="nest.nest_id"
              :label="`${nest.nest_id} - ${getNestStatusText(nest.status)}`"
              :value="nest.nest_id"
            />
          </el-select>
        </el-form-item>
      </div>
      <template #footer>
        <el-button @click="showBindDialog = false">取消</el-button>
        <el-button type="primary" :loading="binding" @click="confirmBind">
          确定绑定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDroneStore } from '@/store/drone'
import { useNestStore } from '@/store/nest'
import { droneApi } from '@/api/drone'
import { formatDateTime, getDroneTypeText, getDroneStatusText, getNestStatusText, getBatteryColor, downloadFile } from '@/utils'

const droneStore = useDroneStore()
const nestStore = useNestStore()

const searchKeyword = ref('')
const filterType = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const showAddDialog = ref(false)
const showBindDialog = ref(false)
const editingDrone = ref(null)
const bindingDrone = ref(null)
const selectedNestId = ref('')
const submitting = ref(false)
const binding = ref(false)
const droneFormRef = ref(null)

const droneForm = reactive({
  drone_id: '',
  drone_type: 1,
  belong_enterprise: '',
  battery_capacity: 5000,
  current_battery: 100
})

const droneRules = {
  drone_id: [
    { required: true, message: '请输入无人机ID', trigger: 'blur' },
    { pattern: /^DR\d{3,}$/, message: '格式：DR开头+3位以上数字', trigger: 'blur' }
  ],
  drone_type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  belong_enterprise: [{ required: true, message: '请输入所属企业', trigger: 'blur' }],
  battery_capacity: [{ required: true, message: '请输入电池容量', trigger: 'blur' }]
}

const filteredDrones = computed(() => {
  let result = droneStore.drones
  if (searchKeyword.value) {
    result = result.filter(d =>
      d.drone_id.includes(searchKeyword.value) ||
      d.belong_enterprise.includes(searchKeyword.value)
    )
  }
  if (filterType.value) {
    result = result.filter(d => d.drone_type === Number(filterType.value))
  }
  if (filterStatus.value !== '') {
    result = result.filter(d => d.status === Number(filterStatus.value))
  }
  return result
})

const availableNests = computed(() => nestStore.nests)

const getDroneTypeClass = (type) => {
  const classes = { 1: 'fixed', 2: 'periodic', 3: 'temporary' }
  return classes[type] || ''
}

const getDroneTypeTag = (type) => {
  const tags = { 1: '', 2: 'success', 3: 'warning' }
  return tags[type] || ''
}

const getDroneStatusClass = (status) => {
  const classes = { 0: 'standby', 1: 'flying', 2: 'charging' }
  return classes[status] || ''
}

const handleSearch = () => {
  currentPage.value = 1
}

const refreshList = () => {
  droneStore.fetchDrones()
  ElMessage.success('列表已刷新')
}

const exportData = async () => {
  try {
    const res = await droneApi.export({ status: filterStatus.value, type: filterType.value })
    downloadFile(new Blob([res], { type: 'text/csv;charset=utf-8' }), `drones_${new Date().toISOString().split('T')[0]}.csv`)
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

const handleRowClick = (row) => {
  console.log('查看详情:', row)
}

const handleSizeChange = (val) => {
  pageSize.value = val
}

const handleCurrentChange = (val) => {
  currentPage.value = val
}

const editDrone = (row) => {
  editingDrone.value = row
  Object.assign(droneForm, {
    drone_id: row.drone_id,
    drone_type: row.drone_type,
    belong_enterprise: row.belong_enterprise,
    battery_capacity: row.battery_capacity,
    current_battery: row.current_battery
  })
  showAddDialog.value = true
}

const submitDrone = async () => {
  if (!droneFormRef.value) return
  
  await droneFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    submitting.value = true
    try {
      if (editingDrone.value) {
        await droneStore.updateDrone(droneForm.drone_id, droneForm)
        ElMessage.success('更新成功')
      } else {
        await droneStore.createDrone(droneForm)
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
  editingDrone.value = null
  Object.assign(droneForm, {
    drone_id: '',
    drone_type: 1,
    belong_enterprise: '',
    battery_capacity: 5000,
    current_battery: 100
  })
}

const bindNest = (row) => {
  bindingDrone.value = row
  selectedNestId.value = row.bind_nest_id || ''
  showBindDialog.value = true
}

const confirmBind = async () => {
  if (!selectedNestId.value) {
    ElMessage.warning('请选择要绑定的机巢')
    return
  }
  
  binding.value = true
  try {
    await droneStore.bindNest(bindingDrone.value.drone_id, selectedNestId.value)
    ElMessage.success('绑定成功')
    showBindDialog.value = false
  } catch (error) {
    ElMessage.error('绑定失败')
  } finally {
    binding.value = false
  }
}

const deleteDrone = (row) => {
  ElMessageBox.confirm(
    `确定要删除无人机 ${row.drone_id} 吗？`,
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await droneStore.deleteDrone(row.drone_id)
      ElMessage.success('删除成功')
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

let refreshTimer = null

onMounted(() => {
  droneStore.fetchDrones()
  nestStore.fetchNests()
  refreshTimer = setInterval(() => {
    droneStore.fetchDrones()
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
.drones-page {
  padding: 24px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
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

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  
  .filter-left {
    display: flex;
    gap: 12px;
  }
}

.stats-row {
  display: flex;
  gap: 24px;
  padding: 16px 20px;
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  margin-bottom: 16px;
  
  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: $text-primary;
      
      &.online { color: $success-color; }
      &.charging { color: $warning-color; }
    }
    
    .stat-label {
      font-size: 12px;
      color: $text-muted;
      margin-top: 4px;
    }
  }
}

.table-container {
  flex: 1;
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  
  :deep(.el-table) {
    --el-table-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
    --el-table-header-bg-color: rgba($bg-darker, 0.5);
    --el-table-row-hover-bg-color: rgba($primary-color, 0.05);
    --el-table-border-color: #{$border-color};
    --el-table-text-color: #{$text-primary};
    --el-table-header-text-color: #{$text-secondary};
    
    flex: 1;
    
    .el-table__body-wrapper {
      overflow-y: auto;
    }
  }
  
  .drone-id {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .drone-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &.fixed { background: rgba(#00d4ff, 0.2); color: #00d4ff; }
      &.periodic { background: rgba(#00e676, 0.2); color: #00e676; }
      &.temporary { background: rgba(#ff6b35, 0.2); color: #ff6b35; }
    }
  }
  
  .battery-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .el-progress {
      flex: 1;
    }
    
    .battery-text {
      width: 36px;
      font-size: 12px;
      color: $text-secondary;
    }
  }
  
  .status-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    
    &.standby {
      background: rgba($text-muted, 0.15);
      color: $text-muted;
    }
    
    &.flying {
      background: rgba($primary-color, 0.15);
      color: $primary-color;
    }
    
    &.charging {
      background: rgba($warning-color, 0.15);
      color: $warning-color;
    }
  }
  
  .nest-link {
    color: $primary-color;
    cursor: pointer;
    
    &:hover {
      text-decoration: underline;
    }
  }
  
  .unbound {
    color: $text-muted;
  }
  
  .action-buttons {
    display: flex;
    gap: 8px;
  }
}

.pagination {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid $border-color;
  
  :deep(.el-pagination) {
    --el-pagination-bg-color: #{$bg-darker};
    --el-pagination-button-bg-color: #{$bg-darker};
    --el-pagination-hover-color: #{$primary-color};
  }
}

.bind-content {
  .current-drone {
    margin-bottom: 16px;
    padding: 12px;
    background: rgba($bg-darker, 0.5);
    border-radius: 8px;
    
    .label {
      color: $text-secondary;
    }
    
    .value {
      font-weight: 600;
      color: $text-primary;
    }
  }
}

@media screen and (max-width: $breakpoint-md) {
  .filter-bar {
    flex-direction: column;
    gap: 12px;
    
    .filter-left, .filter-right {
      width: 100%;
      flex-wrap: wrap;
    }
  }
  
  .stats-row {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
