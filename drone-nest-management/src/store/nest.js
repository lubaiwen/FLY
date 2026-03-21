import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { nestApi } from '@/api/nest'

export const useNestStore = defineStore('nest', () => {
  const nests = ref([])
  const currentNest = ref(null)
  const loading = ref(false)
  const totalCount = ref(0)
  const statistics = ref({
    total: 0,
    online: 0,
    available: 0,
    occupied: 0,
    fault: 0
  })

  const onlineNests = computed(() => 
    nests.value.filter(n => n.status !== 0)
  )
  
  const availableNests = computed(() => 
    nests.value.filter(n => n.status === 1)
  )
  
  const occupiedNests = computed(() => 
    nests.value.filter(n => n.status === 2)
  )
  
  const faultNests = computed(() => 
    nests.value.filter(n => n.status === 3)
  )

  const onlineRate = computed(() => {
    if (statistics.value.total === 0) return 0
    return Math.round((statistics.value.online / statistics.value.total) * 100)
  })

  const utilizationRate = computed(() => {
    if (statistics.value.online === 0) return 0
    return Math.round((statistics.value.occupied / statistics.value.online) * 100)
  })

  async function fetchNests(params = {}) {
    loading.value = true
    try {
      const res = await nestApi.getList(params)
      if (res.code === 200) {
        nests.value = res.data.list
        totalCount.value = res.data.total
      }
      return res.data
    } catch (error) {
      console.error('获取机巢列表失败:', error)
      nests.value = []
      totalCount.value = 0
      return { list: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function fetchStatistics() {
    try {
      const res = await nestApi.getStatistics()
      if (res.code === 200) {
        statistics.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取机巢统计失败:', error)
      return null
    }
  }

  async function fetchAllNests() {
    loading.value = true
    try {
      const res = await nestApi.getList({ pageSize: 1000 })
      if (res.code === 200) {
        nests.value = res.data.list
        totalCount.value = res.data.total
      }
      return res.data
    } catch (error) {
      console.error('获取机巢列表失败:', error)
      nests.value = []
      totalCount.value = 0
      return { list: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function fetchNestById(id) {
    loading.value = true
    try {
      const res = await nestApi.getById(id)
      if (res.code === 200) {
        currentNest.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取机巢详情失败:', error)
      currentNest.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  async function createNest(data) {
    try {
      const res = await nestApi.create(data)
      if (res.code === 200) {
        await fetchNests()
        await fetchStatistics()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('创建机巢失败:', error)
      throw error
    }
  }

  async function updateNest(id, data) {
    try {
      const res = await nestApi.update(id, data)
      if (res.code === 200) {
        const index = nests.value.findIndex(n => n.nest_id === id)
        if (index !== -1) {
          nests.value[index] = res.data
        }
        await fetchStatistics()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('更新机巢失败:', error)
      throw error
    }
  }

  async function deleteNest(id) {
    try {
      const res = await nestApi.delete(id)
      if (res.code === 200) {
        nests.value = nests.value.filter(n => n.nest_id !== id)
        await fetchStatistics()
      }
      return res
    } catch (error) {
      console.error('删除机巢失败:', error)
      throw error
    }
  }

  function updateNestStatus(nestId, status) {
    const nest = nests.value.find(n => n.nest_id === nestId)
    if (nest) {
      nest.status = status
    }
  }

  return {
    nests,
    currentNest,
    loading,
    totalCount,
    statistics,
    onlineNests,
    availableNests,
    occupiedNests,
    faultNests,
    onlineRate,
    utilizationRate,
    fetchNests,
    fetchAllNests,
    fetchStatistics,
    fetchNestById,
    createNest,
    updateNest,
    deleteNest,
    updateNestStatus
  }
})
