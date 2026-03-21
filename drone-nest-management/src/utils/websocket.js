class WebSocketClient {
  constructor(url) {
    this.url = url
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectInterval = 3000
    this.heartbeatInterval = 30000
    this.heartbeatTimer = null
    this.listeners = new Map()
    this.isConnected = false
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      this.ws = new WebSocket(this.url)
      
      this.ws.onopen = () => {
        console.log('WebSocket 连接成功')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.startHeartbeat()
        this.emit('connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          console.error('解析消息失败:', error)
        }
      }

      this.ws.onclose = () => {
        console.log('WebSocket 连接关闭')
        this.isConnected = false
        this.stopHeartbeat()
        this.emit('disconnected')
        this.reconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket 错误:', error)
        this.emit('error', error)
      }
    } catch (error) {
      console.error('WebSocket 连接失败:', error)
      this.reconnect()
    }
  }

  handleMessage(data) {
    const { type, payload } = data
    
    switch (type) {
      case 'nest_status':
        this.emit('nestStatus', payload)
        break
      case 'drone_status':
        this.emit('droneStatus', payload)
        break
      case 'charging_update':
        this.emit('chargingUpdate', payload)
        break
      case 'alert':
        this.emit('alert', payload)
        break
      case 'pong':
        break
      default:
        this.emit('message', data)
    }
  }

  send(type, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index !== -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data))
    }
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send('ping', { timestamp: Date.now() })
    }, this.heartbeatInterval)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('达到最大重连次数，停止重连')
      this.emit('maxReconnectAttempts')
      return
    }

    this.reconnectAttempts++
    console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
    
    setTimeout(() => {
      this.connect()
    }, this.reconnectInterval * this.reconnectAttempts)
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'
export const wsClient = new WebSocketClient(wsUrl)

export default wsClient
