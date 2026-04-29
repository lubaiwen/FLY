import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDroneStore } from './drone'
import { useNestStore } from './nest'

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
      const token = localStorage.getItem('token')
      const separator = this.url.includes('?') ? '&' : '?'
      const url = token ? `${this.url}${separator}token=${encodeURIComponent(token)}` : this.url
      this.ws = new WebSocket(url)

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
        this.ws.send(JSON.stringify({ type: 'ping', payload: { timestamp: Date.now() } }))
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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = import.meta.env.VITE_WS_HOST || window.location.hostname
    const wsPort = import.meta.env.VITE_WS_PORT || '3000'
    const wsUrl = `${protocol}//${wsHost}:${wsPort}/ws`
    
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
      syncToStores()
    })

    wsClient.on('nests_update', (payload) => {
      nests.value = payload.nests || []
      syncNestsToStore()
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
      
      syncDronesToStore()
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
    const newMap = new Map(plannedPaths.value)
    newMap.set(droneId, path)
    plannedPaths.value = newMap
  }

  function applyPath(droneId, path) {
    if (!path?.waypoints?.length) return
    wsClient?.send('apply_path', { drone_id: droneId, waypoints: path.waypoints })
    const newMap = new Map(plannedPaths.value)
    newMap.set(droneId, path)
    plannedPaths.value = newMap
  }

  function clearPlannedPath(droneId) {
    if (droneId) {
      const newMap = new Map(plannedPaths.value)
      newMap.delete(droneId)
      plannedPaths.value = newMap
    } else {
      plannedPaths.value = new Map()
    }
  }

  function getDroneById(droneId) {
    return drones.value.find(d => d.drone_id === droneId)
  }

  function getNestById(nestId) {
    return nests.value.find(n => n.nest_id === nestId)
  }

  function syncDronesToStore() {
    try {
      const droneStore = useDroneStore()
      drones.value.forEach(wsDrone => {
        const index = droneStore.drones.findIndex(d => d.drone_id === wsDrone.drone_id)
        if (index !== -1) {
          const existing = droneStore.drones[index]
          if (wsDrone.status !== undefined) existing.status = wsDrone.status
          if (wsDrone.battery?.current !== undefined) existing.current_battery = wsDrone.battery.current
          if (wsDrone.position) {
            existing.longitude = wsDrone.position.lng
            existing.latitude = wsDrone.position.lat
          }
          if (wsDrone.signal?.connected !== undefined) {
            existing.signal_status = wsDrone.signal.connected ? 1 : 0
          }
        }
      })
    } catch (e) {
      // droneStore may not be initialized yet
    }
  }

  function syncNestsToStore() {
    try {
      const nestStore = useNestStore()
      nests.value.forEach(wsNest => {
        const index = nestStore.nests.findIndex(n => n.nest_id === wsNest.nest_id)
        if (index !== -1) {
          const existing = nestStore.nests[index]
          if (wsNest.status !== undefined) existing.status = wsNest.status
          if (wsNest.current_charging !== undefined) existing.current_charging = wsNest.current_charging
          if (wsNest.current_drone !== undefined) existing.current_drone = wsNest.current_drone
        }
      })
    } catch (e) {
      // nestStore may not be initialized yet
    }
  }

  function syncToStores() {
    syncDronesToStore()
    syncNestsToStore()
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
    applyPath,
    clearPlannedPath,
    getDroneById,
    getNestById
  }
})
