<template>
  <div class="alerts-page">
    <div class="page-header">
      <div class="header-left">
        <h1>故障报警</h1>
        <p>设备故障和异常报警管理</p>
      </div>
      <div class="header-right">
        <el-button @click="markAllRead" :disabled="alertStore.stats.unread === 0">
          <el-icon><Check /></el-icon>
          全部已读
        </el-button>
      </div>
    </div>
    
    <div class="alert-stats">
      <div class="stat-item critical">
        <div class="stat-value">{{ alertStore.stats.critical }}</div>
        <div class="stat-label">严重故障</div>
      </div>
      <div class="stat-item warning">
        <div class="stat-value">{{ alertStore.stats.warning }}</div>
        <div class="stat-label">警告</div>
      </div>
      <div class="stat-item info">
        <div class="stat-value">{{ alertStore.stats.info }}</div>
        <div class="stat-label">提示</div>
      </div>
      <div class="stat-item unread">
        <div class="stat-value">{{ alertStore.stats.unread }}</div>
        <div class="stat-label">未处理</div>
      </div>
    </div>
    
    <div class="filter-bar">
      <div class="filter-left">
        <el-select v-model="filterType" placeholder="报警类型" clearable style="width: 140px">
          <el-option label="严重故障" value="error" />
          <el-option label="警告" value="warning" />
          <el-option label="提示" value="info" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="处理状态" clearable style="width: 120px">
          <el-option label="未处理" value="unread" />
          <el-option label="已处理" value="read" />
        </el-select>
        <el-date-picker
          v-model="filterDate"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 260px"
        />
      </div>
      <div class="filter-right">
        <el-button @click="exportAlerts">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </div>
    
    <div class="alerts-list">
      <div
        class="alert-item"
        v-for="alert in filteredAlerts"
        :key="alert.id"
        :class="[alert.type, { unread: !alert.read }]"
      >
        <div class="alert-icon">
          <el-icon>
            <CircleCloseFilled v-if="alert.type === 'error'" />
            <WarningFilled v-else-if="alert.type === 'warning'" />
            <InfoFilled v-else />
          </el-icon>
        </div>
        
        <div class="alert-content">
          <div class="alert-header">
            <span class="alert-title">{{ alert.title }}</span>
            <span class="alert-time">{{ formatDateTime(alert.timestamp) }}</span>
          </div>
          <div class="alert-message">{{ alert.message }}</div>
          <div class="alert-meta">
            <span class="device-info" v-if="alert.device_id">
              <el-icon><Monitor /></el-icon>
              {{ alert.device_id }}
            </span>
            <span class="location" v-if="alert.location">
              <el-icon><Location /></el-icon>
              {{ alert.location }}
            </span>
          </div>
        </div>
        
        <div class="alert-actions">
          <el-button
            type="primary"
            size="small"
            v-if="!alert.read"
            @click="markAsRead(alert)"
          >
            标记已读
          </el-button>
          <el-button
            type="success"
            size="small"
            v-if="alert.type === 'error'"
            @click="resolveAlert(alert)"
          >
            处理故障
          </el-button>
          <el-button
            type="info"
            size="small"
            @click="viewDetail(alert)"
          >
            详情
          </el-button>
        </div>
      </div>
      
      <div v-if="filteredAlerts.length === 0" class="empty-state">
        <el-icon><CircleCheck /></el-icon>
        <span>暂无报警信息</span>
      </div>
    </div>
    
    <el-drawer
      v-model="showDetailDrawer"
      title="报警详情"
      size="450px"
    >
      <div class="alert-detail" v-if="currentAlert">
        <div class="detail-header">
          <div class="alert-type-badge" :class="currentAlert.type">
            {{ getTypeText(currentAlert.type) }}
          </div>
          <div class="alert-time">{{ formatDateTime(currentAlert.timestamp) }}</div>
        </div>
        
        <div class="detail-section">
          <h4>报警信息</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">报警标题</span>
              <span class="value">{{ currentAlert.title }}</span>
            </div>
            <div class="info-item">
              <span class="label">报警内容</span>
              <span class="value">{{ currentAlert.message }}</span>
            </div>
            <div class="info-item" v-if="currentAlert.device_id">
              <span class="label">关联设备</span>
              <span class="value">{{ currentAlert.device_id }}</span>
            </div>
            <div class="info-item" v-if="currentAlert.location">
              <span class="label">设备位置</span>
              <span class="value">{{ currentAlert.location }}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section" v-if="currentAlert.solution">
          <h4>处理建议</h4>
          <div class="solution-content">
            {{ currentAlert.solution }}
          </div>
        </div>
        
        <div class="detail-section" v-if="currentAlert.logs && currentAlert.logs.length > 0">
          <h4>处理记录</h4>
          <div class="timeline">
            <div class="timeline-item" v-for="(log, index) in currentAlert.logs" :key="index">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="timeline-time">{{ log.time }}</div>
                <div class="timeline-text">{{ log.content }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="detail-actions">
          <el-button type="primary" @click="resolveAlert(currentAlert)">
            标记已处理
          </el-button>
          <el-button @click="viewDevice">
            查看设备
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAlertStore } from '@/store/alert'
import { formatDateTime } from '@/utils'

const alertStore = useAlertStore()

const filterType = ref('')
const filterStatus = ref('')
const filterDate = ref([])
const showDetailDrawer = ref(false)
const currentAlert = ref(null)

const filteredAlerts = computed(() => {
  let result = alertStore.alerts
  if (filterType.value) {
    result = result.filter(a => a.type === filterType.value)
  }
  if (filterStatus.value) {
    result = result.filter(a => filterStatus.value === 'unread' ? !a.read : a.read)
  }
  return result
})

const getTypeText = (type) => {
  const texts = { error: '严重故障', warning: '警告', info: '提示' }
  return texts[type] || type
}

const markAsRead = async (alert) => {
  try {
    await alertStore.markAsRead(alert.id)
    ElMessage.success('已标记为已读')
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  }
}

const markAllRead = async () => {
  try {
    await alertStore.markAllAsRead()
    ElMessage.success('全部已标记为已读')
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  }
}

const resolveAlert = async (alert) => {
  try {
    await alertStore.resolveAlert(alert.id, '已处理')
    ElMessage.success('故障已处理')
    showDetailDrawer.value = false
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  }
}

const viewDetail = (alert) => {
  currentAlert.value = alert
  showDetailDrawer.value = true
}

const viewDevice = () => {
  ElMessage.info('跳转设备详情')
}

const exportAlerts = () => {
  ElMessage.info('导出功能开发中')
}

onMounted(async () => {
  await Promise.all([
    alertStore.fetchAlerts(),
    alertStore.fetchStats()
  ])
})
</script>

<style lang="scss" scoped>
.alerts-page {
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

.alert-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  
  .stat-item {
    background: $bg-card;
    border-radius: $border-radius;
    border: 1px solid $border-color;
    padding: 20px;
    text-align: center;
    
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .stat-label {
      font-size: 13px;
      color: $text-secondary;
    }
    
    &.critical {
      .stat-value { color: $danger-color; }
      border-color: rgba($danger-color, 0.3);
    }
    
    &.warning {
      .stat-value { color: $warning-color; }
      border-color: rgba($warning-color, 0.3);
    }
    
    &.info {
      .stat-value { color: $info-color; }
      border-color: rgba($info-color, 0.3);
    }
    
    &.unread {
      .stat-value { color: $primary-color; }
      border-color: rgba($primary-color, 0.3);
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

.alerts-list {
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  
  .alert-item {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 20px;
    border-bottom: 1px solid $border-color;
    transition: background $transition-fast;
    
    &:last-child {
      border-bottom: none;
    }
    
    &.unread {
      background: rgba($primary-color, 0.03);
    }
    
    &:hover {
      background: rgba($bg-darker, 0.3);
    }
    
    .alert-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      
      .el-icon {
        font-size: 20px;
      }
    }
    
    &.error .alert-icon {
      background: rgba($danger-color, 0.15);
      color: $danger-color;
    }
    
    &.warning .alert-icon {
      background: rgba($warning-color, 0.15);
      color: $warning-color;
    }
    
    &.info .alert-icon {
      background: rgba($info-color, 0.15);
      color: $info-color;
    }
    
    .alert-content {
      flex: 1;
      
      .alert-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        
        .alert-title {
          font-size: 15px;
          font-weight: 600;
          color: $text-primary;
        }
        
        .alert-time {
          font-size: 12px;
          color: $text-muted;
        }
      }
      
      .alert-message {
        font-size: 13px;
        color: $text-secondary;
        line-height: 1.6;
        margin-bottom: 8px;
      }
      
      .alert-meta {
        display: flex;
        gap: 16px;
        
        span {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: $text-muted;
        }
      }
    }
    
    .alert-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px;
  color: $text-muted;
  
  .el-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }
}

.alert-detail {
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid $border-color;
    margin-bottom: 20px;
    
    .alert-type-badge {
      padding: 6px 16px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
      
      &.error {
        background: rgba($danger-color, 0.15);
        color: $danger-color;
      }
      
      &.warning {
        background: rgba($warning-color, 0.15);
        color: $warning-color;
      }
      
      &.info {
        background: rgba($info-color, 0.15);
        color: $info-color;
      }
    }
    
    .alert-time {
      font-size: 13px;
      color: $text-muted;
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
      .info-item {
        display: flex;
        padding: 10px 0;
        border-bottom: 1px solid rgba($border-color, 0.5);
        
        .label {
          width: 80px;
          color: $text-muted;
          font-size: 13px;
        }
        
        .value {
          flex: 1;
          color: $text-primary;
          font-size: 13px;
        }
      }
    }
    
    .solution-content {
      background: rgba($bg-darker, 0.5);
      padding: 16px;
      border-radius: 8px;
      font-size: 13px;
      color: $text-secondary;
      line-height: 1.6;
    }
    
    .timeline {
      .timeline-item {
        display: flex;
        gap: 12px;
        padding-bottom: 16px;
        position: relative;
        
        &:last-child {
          padding-bottom: 0;
        }
        
        .timeline-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: $primary-color;
          margin-top: 4px;
          flex-shrink: 0;
          
          &::after {
            content: '';
            position: absolute;
            left: 4px;
            top: 17px;
            width: 2px;
            height: calc(100% - 10px);
            background: $border-color;
          }
        }
        
        .timeline-content {
          .timeline-time {
            font-size: 12px;
            color: $text-muted;
            margin-bottom: 4px;
          }
          
          .timeline-text {
            font-size: 13px;
            color: $text-primary;
          }
        }
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

@media screen and (max-width: $breakpoint-md) {
  .alert-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .filter-bar {
    flex-direction: column;
    gap: 12px;
    
    .filter-left {
      width: 100%;
      flex-wrap: wrap;
    }
  }
  
  .alert-item {
    flex-direction: column;
    
    .alert-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
}
</style>
