import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNestStore } from './nest'
import { useDroneStore } from './drone'
import { useAlertStore } from './alert'
import { useChargingStore } from './charging'
import { useStatisticsStore } from './statistics'

export const useDataSyncStore = defineStore('dataSync', () => {
  const syncInterval = ref(null)
  const isSyncing = ref(false)
  const lastSyncTime = ref(null)
  const syncError = ref(null)
  const syncFrequency = ref(30000)
  const autoSyncEnabled = ref(true)
  const syncCount = ref(0)
  
  const syncStatus = computed(() => {
    if (syncError.value) return 'error'
    if (isSyncing.value) return 'syncing'
    if (lastSyncTime.value) return 'synced'
    return 'idle'
  })

  const getStores = () => ({
    nest: useNestStore(),
    drone: useDroneStore(),
    alert: useAlertStore(),
    charging: useChargingStore(),
    statistics: useStatisticsStore()
  })

  async function syncAllData() {
    if (isSyncing.value) return
    
    isSyncing.value = true
    syncError.value = null
    
    try {
      const stores = getStores()
      
      await Promise.all([
        stores.nest.fetchNests(),
        stores.nest.fetchStatistics(),
        stores.drone.fetchDrones(),
        stores.alert.fetchAlerts(),
        stores.alert.fetchStats(),
        stores.charging.fetchStats()
      ])
      
      lastSyncTime.value = new Date()
      syncCount.value++
      
      return true
    } catch (error) {
      console.error('数据同步失败:', error)
      syncError.value = error.message
      return false
    } finally {
      isSyncing.value = false
    }
  }

  async function syncModule(moduleName) {
    const stores = getStores()
    
    try {
      switch (moduleName) {
        case 'nests':
          await stores.nest.fetchNests()
          await stores.nest.fetchStatistics()
          break
        case 'drones':
          await stores.drone.fetchDrones()
          break
        case 'alerts':
          await stores.alert.fetchAlerts()
          await stores.alert.fetchStats()
          break
        case 'charging':
          await stores.charging.fetchStats()
          break
        case 'statistics':
          await stores.statistics.fetchOverview()
          await stores.statistics.fetchDistribution()
          break
        default:
          await syncAllData()
      }
      
      lastSyncTime.value = new Date()
      return true
    } catch (error) {
      console.error(`模块 ${moduleName} 同步失败:`, error)
      syncError.value = error.message
      return false
    }
  }

  function startAutoSync(interval = syncFrequency.value) {
    if (syncInterval.value) {
      stopAutoSync()
    }
    
    syncFrequency.value = interval
    autoSyncEnabled.value = true
    
    syncAllData()
    
    syncInterval.value = setInterval(async () => {
      if (autoSyncEnabled.value) {
        await syncAllData()
      }
    }, interval)
    
    console.log(`自动数据同步已启动，间隔: ${interval}ms`)
  }

  function stopAutoSync() {
    if (syncInterval.value) {
      clearInterval(syncInterval.value)
      syncInterval.value = null
    }
    autoSyncEnabled.value = false
    console.log('自动数据同步已停止')
  }

  function setSyncFrequency(ms) {
    syncFrequency.value = ms
    if (autoSyncEnabled.value && syncInterval.value) {
      startAutoSync(ms)
    }
  }

  function clearError() {
    syncError.value = null
  }

  function getSyncInfo() {
    return {
      isSyncing: isSyncing.value,
      lastSyncTime: lastSyncTime.value,
      syncError: syncError.value,
      syncCount: syncCount.value,
      autoSyncEnabled: autoSyncEnabled.value,
      syncFrequency: syncFrequency.value
    }
  }

  return {
    syncInterval,
    isSyncing,
    lastSyncTime,
    syncError,
    syncFrequency,
    autoSyncEnabled,
    syncCount,
    syncStatus,
    syncAllData,
    syncModule,
    startAutoSync,
    stopAutoSync,
    setSyncFrequency,
    clearError,
    getSyncInfo
  }
})
