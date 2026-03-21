import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { orderApi } from '@/api/order'

export const useOrderStore = defineStore('order', () => {
  const orders = ref([])
  const currentOrder = ref(null)
  const stats = ref({
    total: 0,
    pending: 0,
    charging: 0,
    completed: 0,
    cancelled: 0,
    todayCompleted: 0,
    todayRevenue: 0
  })
  const loading = ref(false)
  const totalCount = ref(0)

  const pendingOrders = computed(() => orders.value.filter(o => o.status === 0))
  const chargingOrders = computed(() => orders.value.filter(o => o.status === 1))
  const completedOrders = computed(() => orders.value.filter(o => o.status === 2))
  const cancelledOrders = computed(() => orders.value.filter(o => o.status === 3))

  async function fetchOrders(params = {}) {
    loading.value = true
    try {
      const res = await orderApi.getList(params)
      if (res.code === 200) {
        orders.value = res.data.list
        totalCount.value = res.data.total
      }
      return res.data
    } catch (error) {
      console.error('获取订单列表失败:', error)
      orders.value = []
      totalCount.value = 0
      return { list: [], total: 0 }
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      const res = await orderApi.getStats()
      if (res.code === 200) {
        stats.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取订单统计失败:', error)
      return null
    }
  }

  async function fetchOrderById(id) {
    loading.value = true
    try {
      const res = await orderApi.getById(id)
      if (res.code === 200) {
        currentOrder.value = res.data
      }
      return res.data
    } catch (error) {
      console.error('获取订单详情失败:', error)
      currentOrder.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  async function createOrder(data) {
    try {
      const res = await orderApi.create(data)
      if (res.code === 200) {
        await fetchOrders()
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('创建订单失败:', error)
      throw error
    }
  }

  async function updateOrder(id, data) {
    try {
      const res = await orderApi.update(id, data)
      if (res.code === 200) {
        const index = orders.value.findIndex(o => o.order_id === id)
        if (index !== -1) {
          orders.value[index] = res.data
        }
        return res.data
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('更新订单失败:', error)
      throw error
    }
  }

  async function cancelOrder(id) {
    try {
      const res = await orderApi.cancel(id)
      if (res.code === 200) {
        const order = orders.value.find(o => o.order_id === id)
        if (order) {
          order.status = 3
        }
        return true
      }
      throw new Error(res.message)
    } catch (error) {
      console.error('取消订单失败:', error)
      throw error
    }
  }

  return {
    orders,
    currentOrder,
    stats,
    loading,
    totalCount,
    pendingOrders,
    chargingOrders,
    completedOrders,
    cancelledOrders,
    fetchOrders,
    fetchStats,
    fetchOrderById,
    createOrder,
    updateOrder,
    cancelOrder
  }
})
