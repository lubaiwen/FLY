import { defineStore } from 'pinia'
import { ref } from 'vue'
import { statisticsApi } from '@/api/statistics'

export const useStatisticsStore = defineStore('statistics', () => {
  const overview = ref({
    totalDrones: 0,
    onlineDrones: 0,
    chargingDrones: 0,
    totalNests: 0,
    onlineNests: 0,
    availableNests: 0,
    occupiedNests: 0,
    faultNests: 0,
    utilizationRate: 0,
    onlineRate: 0,
    todayOrders: 0,
    todayRevenue: 0,
    todayAlerts: 0
  })
  
  const trend = ref([])
  const distribution = ref({
    droneTypes: [],
    byEnterprise: [],
    orderStatus: [],
    nestStatus: [],
    faultTypes: []
  })
  
  const heatmap = ref({
    nests: [],
    days: [],
    data: []
  })
  
  const revenue = ref([])
  
  const loading = ref(false)

  async function fetchOverview() {
    try {
      const res = await statisticsApi.getOverview()
      if (res.code === 200) {
        overview.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取概览数据失败:', error)
      return null
    }
  }

  async function fetchTrend(params = {}) {
    loading.value = true
    try {
      const res = await statisticsApi.getTrend(params)
      if (res.code === 200) {
        trend.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取趋势数据失败:', error)
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchDistribution() {
    try {
      const res = await statisticsApi.getDistribution()
      if (res.code === 200) {
        distribution.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取分布数据失败:', error)
      return null
    }
  }

  async function fetchHeatmap() {
    try {
      const res = await statisticsApi.getHeatmap()
      if (res.code === 200) {
        heatmap.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取热力图数据失败:', error)
      return null
    }
  }

  async function fetchRevenue(params = {}) {
    try {
      const res = await statisticsApi.getRevenue(params)
      if (res.code === 200) {
        revenue.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取收入数据失败:', error)
      return []
    }
  }

  async function fetchAll() {
    await Promise.all([
      fetchOverview(),
      fetchDistribution()
    ])
  }

  return {
    overview,
    trend,
    distribution,
    heatmap,
    revenue,
    loading,
    fetchOverview,
    fetchTrend,
    fetchDistribution,
    fetchHeatmap,
    fetchRevenue,
    fetchAll
  }
})
