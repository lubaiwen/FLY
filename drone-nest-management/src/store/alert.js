import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { alertApi } from '@/api/alert'

export const useAlertStore = defineStore('alert', () => {
  const alerts = ref([])
  const stats = ref({
    critical: 0,
    warning: 0,
    info: 0,
    unread: 0,
    total: 0
  })
  const loading = ref(false)

  const unreadCount = computed(() => stats.value.unread)

  const criticalAlerts = computed(() => 
    alerts.value.filter(a => a.type === 'error' && !a.read)
  )

  const warningAlerts = computed(() => 
    alerts.value.filter(a => a.type === 'warning' && !a.read)
  )

  async function fetchAlerts(params = {}) {
    loading.value = true
    try {
      const res = await alertApi.getList(params)
      if (res.code === 200) {
        alerts.value = res.data.list
        stats.value.unread = res.data.unreadCount
      }
      return res.data
    } catch (error) {
      console.error('获取告警列表失败:', error)
      alerts.value = []
      return { list: [], total: 0, unreadCount: 0 }
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      const res = await alertApi.getStats()
      if (res.code === 200) {
        stats.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取告警统计失败:', error)
      return null
    }
  }

  async function fetchAlertById(id) {
    loading.value = true
    try {
      const res = await alertApi.getById(id)
      if (res.code === 200) {
        return res.data
      }
      return null
    } catch (error) {
      console.error('获取告警详情失败:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  async function createAlert(data) {
    try {
      const res = await alertApi.create(data)
      if (res.code === 200) {
        await fetchStats()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('创建告警失败:', error)
      throw error
    }
  }

  async function markAsRead(id) {
    try {
      const res = await alertApi.markAsRead(id)
      if (res.code === 200) {
        const alert = alerts.value.find(a => a.id === id)
        if (alert) {
          alert.read = true
        }
        stats.value.unread = Math.max(0, stats.value.unread - 1)
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('标记已读失败:', error)
      throw error
    }
  }

  async function markAllAsRead() {
    try {
      const res = await alertApi.markAllAsRead()
      if (res.code === 200) {
        alerts.value.forEach(a => a.read = true)
        stats.value.unread = 0
        return true
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('全部标记已读失败:', error)
      throw error
    }
  }

  async function resolveAlert(id, resolution) {
    try {
      const res = await alertApi.resolve(id, { resolution })
      if (res.code === 200) {
        const alert = alerts.value.find(a => a.id === id)
        if (alert) {
          alert.read = true
          alert.resolved = true
          alert.resolution = resolution
        }
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('处理告警失败:', error)
      throw error
    }
  }

  async function deleteAlert(id) {
    try {
      const res = await alertApi.delete(id)
      if (res.code === 200) {
        const alert = alerts.value.find(a => a.id === id)
        if (alert && !alert.read) {
          stats.value.unread = Math.max(0, stats.value.unread - 1)
        }
        alerts.value = alerts.value.filter(a => a.id !== id)
        return true
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('删除告警失败:', error)
      throw error
    }
  }

  function addAlert(alert) {
    const newAlert = {
      id: Date.now(),
      type: alert.type || 'info',
      title: alert.title,
      message: alert.message,
      timestamp: new Date().toISOString(),
      read: false,
      ...alert
    }
    alerts.value.unshift(newAlert)
    stats.value.unread++
    
    if (alerts.value.length > 100) {
      alerts.value = alerts.value.slice(0, 100)
    }
  }

  return {
    alerts,
    stats,
    loading,
    unreadCount,
    criticalAlerts,
    warningAlerts,
    fetchAlerts,
    fetchStats,
    fetchAlertById,
    createAlert,
    markAsRead,
    markAllAsRead,
    resolveAlert,
    deleteAlert,
    addAlert
  }
})
