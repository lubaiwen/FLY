import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { droneApi } from '@/api/drone'

export const useDroneStore = defineStore('drone', () => {
  const drones = ref([])
  const currentDrone = ref(null)
  const loading = ref(false)
  const totalCount = ref(0)

  const onlineDrones = computed(() => 
    drones.value.filter(d => d.status !== 0)
  )
  
  const chargingDrones = computed(() => 
    drones.value.filter(d => d.status === 2)
  )

  const dronesByType = computed(() => ({
    fixed: drones.value.filter(d => d.drone_type === 1),
    periodic: drones.value.filter(d => d.drone_type === 2),
    temporary: drones.value.filter(d => d.drone_type === 3)
  }))

  async function fetchDrones(params = {}) {
    loading.value = true
    try {
      const res = await droneApi.getList(params)
      if (res.code === 200) {
        drones.value = res.data.list
        totalCount.value = res.data.total
      }
      return res.data
    } catch (error) {
      console.error('获取无人机列表失败:', error)
      drones.value = []
      totalCount.value = 0
      return { list: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function fetchDroneById(id) {
    loading.value = true
    try {
      const res = await droneApi.getById(id)
      if (res.code === 200) {
        currentDrone.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取无人机详情失败:', error)
      currentDrone.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  async function createDrone(data) {
    try {
      const res = await droneApi.create(data)
      if (res.code === 200) {
        await fetchDrones()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('创建无人机失败:', error)
      throw error
    }
  }

  async function updateDrone(id, data) {
    try {
      const res = await droneApi.update(id, data)
      if (res.code === 200) {
        const index = drones.value.findIndex(d => d.drone_id === id)
        if (index !== -1) {
          drones.value[index] = res.data
        }
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('更新无人机失败:', error)
      throw error
    }
  }

  async function deleteDrone(id) {
    try {
      const res = await droneApi.delete(id)
      if (res.code === 200) {
        drones.value = drones.value.filter(d => d.drone_id !== id)
      }
      return res
    } catch (error) {
      console.error('删除无人机失败:', error)
      throw error
    }
  }

  async function bindNest(droneId, nestId) {
    try {
      const res = await droneApi.bindNest(droneId, nestId)
      if (res.code === 200) {
        const index = drones.value.findIndex(d => d.drone_id === droneId)
        if (index !== -1) {
          drones.value[index].bind_nest_id = nestId
        }
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('绑定机巢失败:', error)
      throw error
    }
  }

  function updateDroneStatus(droneId, status) {
    const drone = drones.value.find(d => d.drone_id === droneId)
    if (drone) {
      drone.status = status
    }
  }

  function updateDroneBattery(droneId, battery) {
    const drone = drones.value.find(d => d.drone_id === droneId)
    if (drone) {
      drone.current_battery = battery
    }
  }

  return {
    drones,
    currentDrone,
    loading,
    totalCount,
    onlineDrones,
    chargingDrones,
    dronesByType,
    fetchDrones,
    fetchDroneById,
    createDrone,
    updateDrone,
    deleteDrone,
    bindNest,
    updateDroneStatus,
    updateDroneBattery
  }
})
