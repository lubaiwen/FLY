<template>
  <div class="booking-page">
    <div class="page-header">
      <div class="header-left">
        <h1>预约调度</h1>
        <p>管理无人机充电预约和调度安排</p>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建预约
        </el-button>
      </div>
    </div>
    
    <div class="content-grid">
      <div class="calendar-section">
        <div class="card">
          <div class="card-header">
            <h3>预约日历</h3>
            <div class="calendar-nav">
              <el-button-group>
                <el-button size="small" @click="prevWeek">
                  <el-icon><ArrowLeft /></el-icon>
                </el-button>
                <el-button size="small">{{ currentWeekLabel }}</el-button>
                <el-button size="small" @click="nextWeek">
                  <el-icon><ArrowRight /></el-icon>
                </el-button>
              </el-button-group>
              <el-button size="small" @click="goToday">今天</el-button>
            </div>
          </div>
          <div class="calendar-grid">
            <div class="calendar-header">
              <div class="time-column"></div>
              <div
                class="day-column"
                v-for="day in weekDays"
                :key="day.date"
                :class="{ today: isToday(day.date) }"
              >
                <div class="day-name">{{ day.name }}</div>
                <div class="day-date">{{ day.dateNum }}</div>
              </div>
            </div>
            <div class="calendar-body">
              <div class="time-slots">
                <div class="time-slot" v-for="hour in 24" :key="hour">
                  <div class="time-label">{{ String(hour - 1).padStart(2, '0') }}:00</div>
                  <div class="slot-row">
                    <div
                      class="slot-cell"
                      v-for="day in weekDays"
                      :key="day.date"
                      :class="getSlotClass(day.date, hour - 1)"
                      @click="createBookingAt(day.date, hour - 1)"
                    >
                      <div
                        v-for="booking in getBookingsAt(day.date, hour - 1)"
                        :key="booking.id"
                        class="booking-block"
                        :class="booking.type"
                        @click.stop="viewBooking(booking)"
                      >
                        <span class="booking-title">{{ booking.drone_id }}</span>
                        <span class="booking-nest">{{ booking.nest_id }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="sidebar-section">
        <div class="card">
          <div class="card-header">
            <h3>今日预约</h3>
            <el-badge :value="todayBookings.length" type="primary" />
          </div>
          <div class="booking-list">
            <div
              class="booking-item"
              v-for="booking in todayBookings"
              :key="booking.id"
              :class="booking.status"
            >
              <div class="booking-time">
                <el-icon><Clock /></el-icon>
                <span>{{ booking.scheduled_time ? new Date(booking.scheduled_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-' }}</span>
              </div>
              <div class="booking-info">
                <div class="drone-id">{{ booking.drone_id }}</div>
                <div class="nest-id">{{ booking.nest_id }}</div>
              </div>
              <div class="booking-status">
                <el-tag :type="getStatusType(booking.status)" size="small">
                  {{ getStatusText(booking.status) }}
                </el-tag>
              </div>
              <div class="booking-actions">
                <el-button type="primary" link size="small" @click="viewBooking(booking)">
                  详情
                </el-button>
              </div>
            </div>
            <div v-if="todayBookings.length === 0" class="empty-state">
              <el-icon><Calendar /></el-icon>
              <span>今日暂无预约</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h3>可用机巢</h3>
          </div>
          <div class="available-nests">
            <div
              class="nest-item"
              v-for="nest in availableNests"
              :key="nest.nest_id"
              @click="selectNest(nest)"
            >
              <div class="nest-icon">
                <el-icon><OfficeBuilding /></el-icon>
              </div>
              <div class="nest-info">
                <div class="nest-id">{{ nest.nest_id }}</div>
                <div class="nest-power">{{ nest.charge_power }}W</div>
              </div>
              <div class="nest-status">
                <span class="status-dot"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <el-dialog
      v-model="showCreateDialog"
      title="新建预约"
      width="500px"
      destroy-on-close
    >
      <el-form
        ref="bookingFormRef"
        :model="bookingForm"
        :rules="bookingRules"
        label-width="100px"
      >
        <el-form-item label="无人机" prop="drone_id">
          <el-select v-model="bookingForm.drone_id" placeholder="选择无人机" style="width: 100%">
            <el-option
              v-for="drone in droneStore.drones"
              :key="drone.drone_id"
              :label="`${drone.drone_id} - ${getDroneTypeText(drone.drone_type)}`"
              :value="drone.drone_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="机巢" prop="nest_id">
          <el-select v-model="bookingForm.nest_id" placeholder="选择机巢" style="width: 100%">
            <el-option
              v-for="nest in nestStore.availableNests"
              :key="nest.nest_id"
              :label="`${nest.nest_id} - ${nest.charge_power}W`"
              :value="nest.nest_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="预约日期" prop="date">
          <el-date-picker
            v-model="bookingForm.date"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
            :disabled-date="disabledDate"
          />
        </el-form-item>
        <el-form-item label="预约时段" prop="time_range">
          <el-time-picker
            v-model="bookingForm.time_range"
            is-range
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="紧急程度" prop="emergency_level">
          <el-rate v-model="bookingForm.emergency_level" :max="5" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="bookingForm.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitBooking">
          提交预约
        </el-button>
      </template>
    </el-dialog>
    
    <el-drawer
      v-model="showBookingDrawer"
      title="预约详情"
      size="400px"
    >
      <div class="booking-detail" v-if="currentBooking">
        <div class="detail-header">
          <div class="booking-id">{{ currentBooking.id }}</div>
          <el-tag :type="getStatusType(currentBooking.status)">
            {{ getStatusText(currentBooking.status) }}
          </el-tag>
        </div>
        
        <div class="detail-section">
          <div class="detail-item">
            <span class="label">无人机</span>
            <span class="value">{{ currentBooking.drone_id }}</span>
          </div>
          <div class="detail-item">
            <span class="label">机巢</span>
            <span class="value">{{ currentBooking.nest_id }}</span>
          </div>
          <div class="detail-item">
            <span class="label">预约时间</span>
            <span class="value">{{ currentBooking.scheduled_time ? new Date(currentBooking.scheduled_time).toLocaleString('zh-CN') : '-' }}</span>
          </div>
          <div class="detail-item">
            <span class="label">紧急程度</span>
            <span class="value">
              <el-rate :model-value="currentBooking.emergency_level" disabled />
            </span>
          </div>
        </div>
        
        <div class="detail-actions">
          <el-button
            type="success"
            v-if="currentBooking.status === 0"
            @click="confirmBooking"
          >
            确认预约
          </el-button>
          <el-button
            type="danger"
            v-if="currentBooking.status !== 3"
            @click="cancelBooking"
          >
            取消预约
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDroneStore } from '@/store/drone'
import { useNestStore } from '@/store/nest'
import { bookingApi } from '@/api/booking'
import { getDroneTypeText } from '@/utils'

const droneStore = useDroneStore()
const nestStore = useNestStore()

const showCreateDialog = ref(false)
const showBookingDrawer = ref(false)
const currentBooking = ref(null)
const submitting = ref(false)
const bookingFormRef = ref(null)
const currentWeekStart = ref(new Date())
const bookings = ref([])

const bookingForm = reactive({
  drone_id: '',
  nest_id: '',
  date: '',
  time_range: [],
  emergency_level: 1,
  remark: ''
})

const bookingRules = {
  drone_id: [{ required: true, message: '请选择无人机', trigger: 'change' }],
  nest_id: [{ required: true, message: '请选择机巢', trigger: 'change' }],
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  time_range: [{ required: true, message: '请选择时段', trigger: 'change' }]
}

const weekDays = computed(() => {
  const days = []
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const start = new Date(currentWeekStart.value)
  for (let i = 0; i < 7; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    days.push({
      date: date.toISOString().split('T')[0],
      name: dayNames[date.getDay()],
      dateNum: date.getDate()
    })
  }
  return days
})

const currentWeekLabel = computed(() => {
  const start = weekDays.value[0]
  const end = weekDays.value[6]
  return `${start.date.slice(5)} ~ ${end.date.slice(5)}`
})

const todayBookings = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return bookings.value.filter(b => b.scheduled_time?.startsWith(today))
})

const availableNests = computed(() => nestStore.availableNests)

const isToday = (date) => date === new Date().toISOString().split('T')[0]

const prevWeek = () => {
  const start = new Date(currentWeekStart.value)
  start.setDate(start.getDate() - 7)
  currentWeekStart.value = start
}

const nextWeek = () => {
  const start = new Date(currentWeekStart.value)
  start.setDate(start.getDate() + 7)
  currentWeekStart.value = start
}

const goToday = () => { currentWeekStart.value = new Date() }

const getSlotClass = (date, hour) => ({
  past: isPast(date, hour),
  available: !isPast(date, hour) && getBookingsAt(date, hour).length === 0
})

const isPast = (date, hour) => {
  const slotDate = new Date(date)
  slotDate.setHours(hour)
  return slotDate < new Date()
}

const getBookingsAt = (date, hour) => {
  return bookings.value.filter(b => {
    if (!b.scheduled_time) return false
    const d = new Date(b.scheduled_time)
    const bookingDate = d.toISOString().split('T')[0]
    const bookingHour = d.getHours()
    const estimatedDuration = b.estimated_duration || 60 // 默认60分钟
    const durationHours = Math.ceil(estimatedDuration / 60)
    
    // 检查预约是否覆盖当前小时
    return bookingDate === date && bookingHour <= hour && hour < bookingHour + durationHours
  })
}

const createBookingAt = (date, hour) => {
  if (isPast(date, hour)) return
  bookingForm.date = date
  const startTime = new Date()
  startTime.setHours(hour, 0, 0, 0)
  const endTime = new Date(startTime)
  endTime.setHours(hour + 1)
  bookingForm.time_range = [startTime, endTime]
  showCreateDialog.value = true
}

const viewBooking = (booking) => {
  currentBooking.value = booking
  showBookingDrawer.value = true
}

const selectNest = (nest) => {
  bookingForm.nest_id = nest.nest_id
  showCreateDialog.value = true
}

const disabledDate = (date) => date < new Date(new Date().setHours(0, 0, 0, 0))

const getStatusType = (status) => {
  const types = { 0: 'warning', 1: 'success', 2: 'primary', 3: 'danger' }
  return types[status] || ''
}

const getStatusText = (status) => {
  const texts = { 0: '待确认', 1: '已确认', 2: '充电中', 3: '已取消' }
  return texts[status] ?? String(status)
}

const loadBookings = async () => {
  try {
    const res = await bookingApi.getList({ pageSize: 200 })
    if (res.code === 200) bookings.value = res.data.list || []
  } catch (e) {
    console.error('加载预约失败:', e)
  }
}

const submitBooking = async () => {
  if (!bookingFormRef.value) return
  await bookingFormRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      const [start, end] = bookingForm.time_range
      const scheduledTime = new Date(bookingForm.date)
      const startDate = new Date(start)
      scheduledTime.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0)
      const durationMs = new Date(end) - startDate
      const estimatedDuration = Math.round(durationMs / 60000)

      const res = await bookingApi.create({
        drone_id: bookingForm.drone_id,
        nest_id: bookingForm.nest_id,
        booking_type: 1,
        scheduled_time: scheduledTime.toISOString(),
        estimated_duration: estimatedDuration,
        notes: bookingForm.remark
      })
      if (res.code === 200) {
        ElMessage.success('预约创建成功')
        showCreateDialog.value = false
        resetForm()
        await loadBookings()
      }
    } catch (e) {
      ElMessage.error('预约创建失败')
    } finally {
      submitting.value = false
    }
  })
}

const resetForm = () => {
  Object.assign(bookingForm, { drone_id: '', nest_id: '', date: '', time_range: [], emergency_level: 1, remark: '' })
}

const confirmBooking = () => {
  ElMessageBox.confirm('确认该预约吗？', '确认', {
    confirmButtonText: '确定', cancelButtonText: '取消', type: 'info'
  }).then(async () => {
    try {
      const res = await bookingApi.confirm(currentBooking.value.id)
      if (res.code === 200) {
        currentBooking.value.status = 1
        ElMessage.success('预约已确认')
        await loadBookings()
      }
    } catch (e) { ElMessage.error('操作失败') }
  }).catch(() => {})
}

const cancelBooking = () => {
  ElMessageBox.confirm('确定要取消该预约吗？', '取消预约', {
    confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
  }).then(async () => {
    try {
      const res = await bookingApi.cancel(currentBooking.value.id)
      if (res.code === 200) {
        currentBooking.value.status = 3
        ElMessage.success('预约已取消')
        await loadBookings()
      }
    } catch (e) { ElMessage.error('操作失败') }
  }).catch(() => {})
}

onMounted(() => {
  droneStore.fetchDrones()
  nestStore.fetchNests()
  loadBookings()
})
</script>

<style lang="scss" scoped>
.booking-page {
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

.content-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
}

.card {
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid $border-color;
    
    h3 {
      font-size: 15px;
      font-weight: 600;
      color: $text-primary;
    }
  }
}

.calendar-section {
  .card {
    overflow: hidden;
  }
  
  .calendar-nav {
    display: flex;
    gap: 12px;
  }
}

.calendar-grid {
  .calendar-header {
    display: grid;
    grid-template-columns: 60px repeat(7, 1fr);
    background: rgba($bg-darker, 0.5);
    border-bottom: 1px solid $border-color;
    
    .day-column {
      padding: 12px;
      text-align: center;
      
      &.today {
        background: rgba($primary-color, 0.1);
        
        .day-date {
          background: $primary-color;
          color: white;
        }
      }
      
      .day-name {
        font-size: 12px;
        color: $text-muted;
        margin-bottom: 4px;
      }
      
      .day-date {
        display: inline-block;
        width: 28px;
        height: 28px;
        line-height: 28px;
        border-radius: 50%;
        font-size: 14px;
        font-weight: 600;
        color: $text-primary;
      }
    }
  }
  
  .calendar-body {
    max-height: 500px;
    overflow-y: auto;
  }
  
  .time-slots {
    .time-slot {
      display: grid;
      grid-template-columns: 60px 1fr;
      border-bottom: 1px solid $border-color;
      min-height: 48px;
      
      &:last-child {
        border-bottom: none;
      }
      
      .time-label {
        padding: 8px;
        font-size: 11px;
        color: $text-muted;
        text-align: right;
        border-right: 1px solid $border-color;
      }
      
      .slot-row {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
      }
      
      .slot-cell {
        padding: 4px;
        border-right: 1px solid $border-color;
        cursor: pointer;
        transition: background $transition-fast;
        min-height: 40px;
        
        &:last-child {
          border-right: none;
        }
        
        &.past {
          background: rgba($bg-darker, 0.3);
          cursor: not-allowed;
        }
        
        &.available:hover {
          background: rgba($primary-color, 0.1);
        }
        
        .booking-block {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          transition: all $transition-fast;
          
          .booking-title {
            font-weight: 600;
            display: block;
          }
          
          .booking-nest {
            color: rgba(255, 255, 255, 0.8);
          }
          
          &.fixed {
            background: rgba($primary-color, 0.8);
            color: white;
          }
          
          &.periodic {
            background: rgba($success-color, 0.8);
            color: white;
          }
          
          &.temporary {
            background: rgba($warning-color, 0.8);
            color: white;
          }
          
          &:hover {
            transform: scale(1.02);
            box-shadow: $shadow-sm;
          }
        }
      }
    }
  }
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.booking-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  
  .booking-item {
    display: grid;
    grid-template-columns: 80px 1fr auto auto;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba($bg-darker, 0.5);
    border-radius: 8px;
    margin-bottom: 8px;
    
    .booking-time {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: $text-secondary;
    }
    
    .booking-info {
      .drone-id {
        font-weight: 600;
        color: $text-primary;
        font-size: 13px;
      }
      
      .nest-id {
        font-size: 11px;
        color: $text-muted;
      }
    }
  }
}

.available-nests {
  padding: 12px;
  
  .nest-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba($bg-darker, 0.5);
    border-radius: 8px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: all $transition-fast;
    
    &:hover {
      background: rgba($primary-color, 0.1);
    }
    
    .nest-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: rgba($success-color, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: $success-color;
    }
    
    .nest-info {
      flex: 1;
      
      .nest-id {
        font-weight: 600;
        color: $text-primary;
        font-size: 13px;
      }
      
      .nest-power {
        font-size: 11px;
        color: $text-muted;
      }
    }
    
    .nest-status {
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: $success-color;
      }
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  color: $text-muted;
  
  .el-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }
}

.booking-detail {
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid $border-color;
    margin-bottom: 16px;
    
    .booking-id {
      font-size: 18px;
      font-weight: 600;
      color: $text-primary;
    }
  }
  
  .detail-section {
    margin-bottom: 24px;
    
    .detail-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba($border-color, 0.5);
      
      .label {
        color: $text-muted;
        font-size: 13px;
      }
      
      .value {
        color: $text-primary;
        font-size: 13px;
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
  .content-grid {
    grid-template-columns: 1fr;
  }
  
  .sidebar-section {
    flex-direction: row;
    flex-wrap: wrap;
    
    .card {
      flex: 1;
      min-width: 280px;
    }
  }
}
</style>
