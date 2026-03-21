import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { chargingApi } from '@/api/charging'

export const useChargingStore = defineStore('charging', () => {
  const chargingList = ref([])
  const waitingList = ref([])
  const completedList = ref([])
  const stats = ref({
    chargingCount: 0,
    waitingCount: 0,
    completedCount: 0,
    totalPower: '0.0'
  })
  const loading = ref(false)

  const allRecords = computed(() => [
    ...chargingList.value,
    ...waitingList.value,
    ...completedList.value
  ])

  async function fetchStats() {
    loading.value = true
    try {
      const res = await chargingApi.getStats()
      if (res.code === 200) {
        stats.value = {
          chargingCount: res.data.chargingCount,
          waitingCount: res.data.waitingCount,
          completedCount: res.data.completedCount,
          totalPower: res.data.totalPower
        }
        chargingList.value = res.data.chargingList || []
        waitingList.value = res.data.waitingList || []
        completedList.value = res.data.completedList || []
      }
      return res.data
    } catch (error) {
      console.error('获取充电统计失败:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchRecords(params = {}) {
    loading.value = true
    try {
      const res = await chargingApi.getList(params)
      if (res.code === 200) {
        return res.data
      }
      return { list: [], total: 0 }
    } catch (error) {
      console.error('获取充电记录失败:', error)
      return { list: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function createCharging(data) {
    try {
      const res = await chargingApi.create(data)
      if (res.code === 200) {
        await fetchStats()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('创建充电任务失败:', error)
      throw error
    }
  }

  async function stopCharging(orderId) {
    try {
      const res = await chargingApi.stop(orderId)
      if (res.code === 200) {
        await fetchStats()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('停止充电失败:', error)
      throw error
    }
  }

  async function updateRecord(id, data) {
    try {
      const res = await chargingApi.update(id, data)
      if (res.code === 200) {
        await fetchStats()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('更新充电记录失败:', error)
      throw error
    }
  }

  function cancelWaiting(orderId) {
    const index = waitingList.value.findIndex(r => r.order_id === orderId)
    if (index !== -1) {
      waitingList.value.splice(index, 1)
      stats.value.waitingCount = waitingList.value.length
    }
  }

  return {
    chargingList,
    waitingList,
    completedList,
    stats,
    loading,
    allRecords,
    fetchStats,
    fetchRecords,
    createCharging,
    stopCharging,
    updateRecord,
    cancelWaiting
  }
})
