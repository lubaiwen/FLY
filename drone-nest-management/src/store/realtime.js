import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url
    this.options = options
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5
    this.reconnectInterval = options.reconnectInterval || 3000
    this.heartbeatInterval = null
    this.isConnecting = false
    this.listeners = new Map()
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return
    }

    this.isConnecting = true

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('WebSocket连接成功')
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.startHeartbeat()
        this.emit('connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.emit('message', data)
          
          if (data.type) {
            this.emit(data.type, data.payload)
          }
        } catch (error) {
          console.error('WebSocket消息解析错误:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket连接关闭:', event.code, event.reason)
        this.isConnecting = false
        this.stopHeartbeat()
        this.emit('disconnected', { code: event.code, reason: event.reason })
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket错误:', error)
        this.isConnecting = false
        this.emit('error', error)
      }
    } catch (error) {
      console.error('WebSocket连接失败:', error)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  scheduleReconnect() {
    this.reconnectAttempts++
    console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
    
    setTimeout(() => {
      this.connect()
    }, this.reconnectInterval * this.reconnectAttempts)
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close(1000, '主动断开')
      this.ws = null
    }
  }

  send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
      return true
    }
    return false
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping()
      }
    }, 30000)
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event).add(callback)
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback)
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data))
    }
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const useRealtimeStore = defineStore('realtime', () => {
  const drones = ref([])
  const nests = ref([])
  const trajectories = ref(new Map())
  const plannedPaths = ref(new Map())
  const selectedDrone = ref(null)
  const trackingDrone = ref(null)
  const connectionStatus = ref('disconnected')
  const lastUpdate = ref(null)
  
  let wsClient = null

  const onlineDrones = computed(() => 
    drones.value.filter(d => d.signal?.connected)
  )

  const flyingDrones = computed(() => 
    drones.value.filter(d => d.status === 1 && d.signal?.connected)
  )

  const lowBatteryDrones = computed(() => 
    drones.value.filter(d => d.battery?.current < 20)
  )

  function connect() {
    if (wsClient?.isConnected) return

    const wsUrl = `ws://${window.location.hostname}:3000/ws`
    
    wsClient = new WebSocketClient(wsUrl, {
      maxReconnectAttempts: 10,
      reconnectInterval: 2000
    })

    wsClient.on('connected', () => {
      connectionStatus.value = 'connected'
    })

    wsClient.on('disconnected', () => {
      connectionStatus.value = 'disconnected'
    })

    wsClient.on('error', () => {
      connectionStatus.value = 'error'
    })

    wsClient.on('init', (payload) => {
      drones.value = payload.drones || []
      nests.value = payload.nests || []
    })

    wsClient.on('update', (payload) => {
      lastUpdate.value = payload.timestamp
      
      payload.drones.forEach(updatedDrone => {
        const index = drones.value.findIndex(d => d.drone_id === updatedDrone.drone_id)
        if (index !== -1) {
          const oldDrone = drones.value[index]
          
          if (oldDrone.signal?.connected && !updatedDrone.signal?.connected) {
            updatedDrone.lastKnownPosition = { ...oldDrone.position }
          }
          
          drones.value[index] = { ...drones.value[index], ...updatedDrone }
        } else {
          drones.value.push(updatedDrone)
        }
      })
    })

    wsClient.on('trajectory', (payload) => {
      trajectories.value.set(payload.drone_id, payload.trajectory)
    })

    wsClient.connect()
  }

  function disconnect() {
    if (wsClient) {
      wsClient.disconnect()
      wsClient = null
    }
    connectionStatus.value = 'disconnected'
  }

  function subscribeDrone(droneId) {
    wsClient?.send('subscribe', { drones: [droneId] })
  }

  function subscribeAll() {
    wsClient?.send('subscribe', { drones: 'all' })
  }

  function setDroneStatus(droneId, status) {
    wsClient?.send('set_status', { drone_id: droneId, status })
  }

  function setDroneTarget(droneId, targetNest) {
    wsClient?.send('set_target', { drone_id: droneId, target_nest: targetNest })
  }

  function disconnectDrone(droneId) {
    wsClient?.send('disconnect_drone', { drone_id: droneId })
  }

  function reconnectDrone(droneId) {
    wsClient?.send('reconnect_drone', { drone_id: droneId })
  }

  function getTrajectory(droneId, startTime, endTime) {
    wsClient?.send('get_trajectory', { 
      drone_id: droneId, 
      start_time: startTime, 
      end_time: endTime 
    })
  }

  function selectDrone(droneId) {
    selectedDrone.value = drones.value.find(d => d.drone_id === droneId) || null
  }

  function clearSelection() {
    selectedDrone.value = null
  }

  function startTracking(droneId) {
    trackingDrone.value = droneId
  }

  function stopTracking() {
    trackingDrone.value = null
  }

  function setPlannedPath(droneId, path) {
    plannedPaths.value.set(droneId, path)
  }

  function clearPlannedPath(droneId) {
    if (droneId) {
      plannedPaths.value.delete(droneId)
    } else {
      plannedPaths.value.clear()
    }
  }

  function getDroneById(droneId) {
    return drones.value.find(d => d.drone_id === droneId)
  }

  function getNestById(nestId) {
    return nests.value.find(n => n.nest_id === nestId)
  }

  return {
    drones,
    nests,
    trajectories,
    plannedPaths,
    selectedDrone,
    trackingDrone,
    connectionStatus,
    lastUpdate,
    onlineDrones,
    flyingDrones,
    lowBatteryDrones,
    connect,
    disconnect,
    subscribeDrone,
    subscribeAll,
    setDroneStatus,
    setDroneTarget,
    disconnectDrone,
    reconnectDrone,
    getTrajectory,
    selectDrone,
    clearSelection,
    startTracking,
    stopTracking,
    setPlannedPath,
    clearPlannedPath,
    getDroneById,
    getNestById
  }
})
