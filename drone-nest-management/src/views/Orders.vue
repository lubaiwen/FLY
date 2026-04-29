<template>
  <div class="orders-page">
    <div class="page-header">
      <div class="header-left">
        <h1>订单管理</h1>
        <p>管理所有充电订单</p>
      </div>
    </div>
    
    <div class="filter-bar">
      <div class="filter-left">
        <el-input v-model="searchKeyword" placeholder="搜索订单ID" prefix-icon="Search" clearable style="width: 200px" />
        <el-select v-model="filterStatus" placeholder="订单状态" clearable style="width: 120px">
          <el-option label="待支付" :value="0" />
          <el-option label="充电中" :value="1" />
          <el-option label="已完成" :value="2" />
          <el-option label="已取消" :value="3" />
        </el-select>
        <el-date-picker v-model="filterDate" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" />
      </div>
      <el-button type="primary" @click="exportOrders">
        <el-icon><Download /></el-icon>
        导出订单
      </el-button>
    </div>
    
    <div class="orders-table">
      <el-table :data="filteredOrders" style="width: 100%" v-loading="orderStore.loading">
        <el-table-column prop="order_id" label="订单ID" width="140" />
        <el-table-column prop="drone_id" label="无人机" width="120" />
        <el-table-column prop="nest_id" label="机巢" width="120" />
        <el-table-column prop="start_time" label="开始时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.start_time) }}</template>
        </el-table-column>
        <el-table-column prop="charge_duration" label="充电时长" width="100">
          <template #default="{ row }">{{ row.charge_duration || 0 }}分钟</template>
        </el-table-column>
        <el-table-column prop="fee" label="费用" width="100">
          <template #default="{ row }">
            <span class="fee">¥{{ row.fee || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewOrder(row)">详情</el-button>
            <el-button type="danger" link size="small" v-if="row.status === 0" @click="cancelOrder(row)">取消</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    
    <el-drawer v-model="showOrderDrawer" title="订单详情" size="450px">
      <div class="order-detail" v-if="currentOrder">
        <div class="detail-header">
          <div class="order-id">{{ currentOrder.order_id }}</div>
          <el-tag :type="getStatusType(currentOrder.status)">{{ getStatusText(currentOrder.status) }}</el-tag>
        </div>
        <div class="detail-section">
          <div class="info-row"><span class="label">无人机</span><span class="value">{{ currentOrder.drone_id }}</span></div>
          <div class="info-row"><span class="label">机巢</span><span class="value">{{ currentOrder.nest_id }}</span></div>
          <div class="info-row"><span class="label">企业</span><span class="value">{{ currentOrder.enterprise_id }}</span></div>
          <div class="info-row"><span class="label">开始时间</span><span class="value">{{ formatDateTime(currentOrder.start_time) }}</span></div>
          <div class="info-row"><span class="label">充电时长</span><span class="value">{{ currentOrder.charge_duration || 0 }}分钟</span></div>
          <div class="info-row"><span class="label">费用</span><span class="value fee">¥{{ currentOrder.fee || 0 }}</span></div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useOrderStore } from '@/store/order'
import { orderApi } from '@/api/order'
import { formatDateTime, downloadFile } from '@/utils'

const orderStore = useOrderStore()

const searchKeyword = ref('')
const filterStatus = ref(null)
const filterDate = ref([])
const showOrderDrawer = ref(false)
const currentOrder = ref(null)

const filteredOrders = computed(() => {
  let result = orderStore.orders
  if (searchKeyword.value) {
    result = result.filter(o => 
      o.order_id.includes(searchKeyword.value) ||
      o.drone_id.includes(searchKeyword.value) ||
      o.nest_id.includes(searchKeyword.value)
    )
  }
  if (filterStatus.value !== null && filterStatus.value !== '') {
    result = result.filter(o => o.status === filterStatus.value)
  }
  return result
})

const getStatusType = (status) => ({ 0: 'warning', 1: 'primary', 2: 'success', 3: 'info' }[status] || '')
const getStatusText = (status) => ({ 0: '待支付', 1: '充电中', 2: '已完成', 3: '已取消' }[status] || '')

const viewOrder = (order) => {
  currentOrder.value = order
  showOrderDrawer.value = true
}

const cancelOrder = async (order) => {
  try {
    await orderStore.cancelOrder(order.order_id)
    ElMessage.success('订单已取消')
  } catch (error) {
    ElMessage.error(error.message || '取消失败')
  }
}

const exportOrders = async () => {
  try {
    const res = await orderApi.export({ status: filterStatus.value, keyword: searchKeyword.value })
    downloadFile(new Blob([res], { type: 'text/csv;charset=utf-8' }), `orders_${new Date().toISOString().split('T')[0]}.csv`)
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

let refreshTimer = null

onMounted(() => {
  orderStore.fetchOrders()
  orderStore.fetchStats()
  refreshTimer = setInterval(() => {
    orderStore.fetchOrders()
    orderStore.fetchStats()
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
.orders-page { padding: 24px; min-height: 100%; overflow-y: auto; max-height: calc(100vh - 64px); }
.page-header { display: flex; justify-content: space-between; margin-bottom: 20px;
  h1 { font-size: 24px; font-weight: 600; color: $text-primary; margin-bottom: 4px; }
  p { font-size: 14px; color: $text-secondary; }
}
.filter-bar { display: flex; justify-content: space-between; margin-bottom: 20px; .filter-left { display: flex; gap: 12px; } }
.orders-table { background: $bg-card; border-radius: $border-radius; border: 1px solid $border-color;
  :deep(.el-table) { --el-table-bg-color: transparent; --el-table-tr-bg-color: transparent; --el-table-header-bg-color: rgba($bg-darker, 0.5); --el-table-row-hover-bg-color: rgba($primary-color, 0.05); --el-table-border-color: #{$border-color}; --el-table-text-color: #{$text-primary}; }
}
.fee { color: $warning-color; font-weight: 600; }
.order-detail { .detail-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 1px solid $border-color; margin-bottom: 16px; .order-id { font-size: 18px; font-weight: 600; } }
  .detail-section { .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba($border-color, 0.5); .label { color: $text-muted; } .value { color: $text-primary; } } }
}
</style>
