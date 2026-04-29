const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')
const { getJwtSecret } = require('../config/env')

const JWT_SECRET = getJwtSecret()
const CONTROL_MESSAGE_TYPES = new Set(['set_status', 'apply_path', 'set_target', 'disconnect_drone', 'reconnect_drone'])
const CONTROL_ROLES = new Set(['admin', 'operator'])

class DroneSimulator {
  constructor() {
    this.drones = new Map()
    this.trajectories = new Map()
    this.isRunning = false
    this.updateInterval = null
    this.dbData = { drones: [], nests: [] }
  }

  async loadFromDatabase() {
    try {
      const [drones] = await pool.query('SELECT * FROM drones')
      const [nests] = await pool.query('SELECT * FROM nests')
      
      this.dbData.drones = drones
      this.dbData.nests = nests
      
      console.log(`从数据库加载了 ${drones.length} 台无人机和 ${nests.length} 台机巢`)
      return true
    } catch (error) {
      console.log('数据库加载失败，使用内存数据:', error.message)
      this.dbData.drones = MemoryStore.drones
      this.dbData.nests = MemoryStore.nests
      return false
    }
  }

  init() {
    const dataSource = this.dbData.drones.length > 0 ? this.dbData.drones : MemoryStore.drones

    dataSource.forEach(drone => {
      const baseLng = parseFloat(drone.longitude) || 117.2272
      const baseLat = parseFloat(drone.latitude) || 31.8206

      this.drones.set(drone.drone_id, {
        drone_id: drone.drone_id,
        drone_type: drone.drone_type || 1,
        status: drone.status || 0,
        position: {
          lng: baseLng + (Math.random() - 0.5) * 0.002,
          lat: baseLat + (Math.random() - 0.5) * 0.002,
          altitude: 50 + Math.random() * 100
        },
        velocity: {
          speed: 0,
          heading: Math.random() * 360,
          vertical_speed: 0
        },
        battery: {
          current: drone.current_battery || 75,
          max: 100,
          consumption_rate: 0.1
        },
        signal: {
          strength: 95 + Math.random() * 5,
          connected: true,
          last_update: Date.now()
        },
        task: {
          id: null,
          type: null,
          target_nest: null,
          status: null
        },
        // 路径跟随状态
        path: null,          // 当前规划路径的 waypoints 数组
        pathIndex: 0,        // 当前目标 waypoint 索引
        trajectory: [],
        belong_enterprise: drone.belong_enterprise
      })

      this.trajectories.set(drone.drone_id, [])
    })
  }

  // 应用规划路径，驱动无人机沿路径飞行
  applyPath(droneId, waypoints) {
    const drone = this.drones.get(droneId)
    if (!drone || !waypoints || waypoints.length < 2) return false
    drone.path = waypoints
    drone.pathIndex = 1  // 从第二个点开始（第一个是起点）
    drone.status = 1     // 设为飞行中
    drone.task.status = 'in_progress'
    return true
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.init()
    
    this.updateInterval = setInterval(() => {
      this.update()
    }, 1000)
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    this.isRunning = false
  }

  update() {
    const now = Date.now()

    this.drones.forEach((drone, droneId) => {
      if (!drone.signal.connected) return

      if (drone.status === 1) {
        // 路径跟随模式
        if (drone.path && drone.pathIndex < drone.path.length) {
          const target = drone.path[drone.pathIndex]
          const targetLng = target.position.lng || target.position.lon
          const targetLat = target.position.lat
          const targetAlt = target.position.altitude || 80

          const dLng = targetLng - drone.position.lng
          const dLat = targetLat - drone.position.lat
          const dist = Math.sqrt(dLng * dLng + dLat * dLat) * 111000

          const speed = 12 // m/s
          const step = speed / 111000

          if (dist < 15) {
            // 到达当前 waypoint，前进到下一个
            drone.position.lng = targetLng
            drone.position.lat = targetLat
            drone.position.altitude = targetAlt
            drone.pathIndex++

            if (drone.pathIndex >= drone.path.length) {
              // 到达终点（机巢）
              drone.path = null
              drone.pathIndex = 0
              drone.velocity.speed = 0
              drone.task.status = 'completed'
              
              // 开始充电
              if (drone.battery.current < drone.battery.max) {
                drone.status = 2  // 充电中
                drone.task.type = 'charging'
                drone.task.status = 'in_progress'
              } else {
                drone.status = 0  // 空闲
              }
            }
          } else {
            // 朝目标 waypoint 移动
            const heading = Math.atan2(dLng, dLat) * 180 / Math.PI
            const headingRad = heading * Math.PI / 180
            drone.position.lng += step * Math.sin(headingRad)
            drone.position.lat += step * Math.cos(headingRad)
            drone.position.altitude += (targetAlt - drone.position.altitude) * 0.05
            drone.position.altitude = Math.max(20, Math.min(150, drone.position.altitude))
            drone.velocity.speed = speed
            drone.velocity.heading = (heading + 360) % 360
          }
        } else {
          // 无路径时随机飞行
          drone.path = null
          const speed = 5 + Math.random() * 10
          const headingRad = (drone.velocity.heading * Math.PI) / 180
          const distance = speed / 111000
          const newLng = drone.position.lng + distance * Math.sin(headingRad)
          const newLat = drone.position.lat + distance * Math.cos(headingRad)
          const BOUNDS = { minLng: 116.0, maxLng: 119.0, minLat: 30.0, maxLat: 33.0 }
          if (newLng >= BOUNDS.minLng && newLng <= BOUNDS.maxLng && newLat >= BOUNDS.minLat && newLat <= BOUNDS.maxLat) {
            drone.position.lng = newLng
            drone.position.lat = newLat
          } else {
            drone.velocity.heading = (drone.velocity.heading + 180 + (Math.random() - 0.5) * 60 + 360) % 360
          }
          drone.position.altitude += (Math.random() - 0.5) * 2
          drone.position.altitude = Math.max(20, Math.min(150, drone.position.altitude))
          drone.velocity.speed = speed
          drone.velocity.heading += (Math.random() - 0.5) * 10
          drone.velocity.heading = (drone.velocity.heading + 360) % 360
        }

        drone.battery.current -= drone.battery.consumption_rate * (drone.velocity.speed / 10)
        drone.battery.current = Math.max(0, drone.battery.current)

        if (drone.battery.current <= 0) {
          drone.status = 0
          drone.velocity.speed = 0
          drone.path = null
          drone.pathIndex = 0
          drone.task.status = 'failed'
        }
      } else if (drone.status === 2) {
        // 充电中
        const chargeRate = 1.0 / 60
        drone.battery.current += chargeRate
        
        if (drone.battery.current >= drone.battery.max) {
          drone.battery.current = drone.battery.max
          drone.status = 0  // 充电完成，转为空闲
          drone.task.type = null
          drone.task.status = 'completed'
        }
      }

      drone.signal.strength = 90 + Math.random() * 10
      drone.signal.last_update = now

      const trajectory = this.trajectories.get(droneId) || []
      trajectory.push({
        timestamp: now,
        position: { ...drone.position },
        speed: drone.velocity.speed,
        battery: drone.battery.current
      })
      if (trajectory.length > 3600) trajectory.shift()
      this.trajectories.set(droneId, trajectory)
    })
  }

  getDroneData(droneId) {
    return this.drones.get(droneId)
  }

  getAllDrones() {
    return Array.from(this.drones.values())
  }

  getTrajectory(droneId, startTime = null, endTime = null) {
    let trajectory = this.trajectories.get(droneId) || []
    
    if (startTime) {
      trajectory = trajectory.filter(t => t.timestamp >= startTime)
    }
    if (endTime) {
      trajectory = trajectory.filter(t => t.timestamp <= endTime)
    }
    
    return trajectory
  }

  setDroneStatus(droneId, status) {
    const drone = this.drones.get(droneId)
    if (drone) {
      drone.status = status
      if (status === 0) {
        drone.velocity.speed = 0
      }
      return true
    }
    return false
  }

  setDroneTarget(droneId, targetNest) {
    const drone = this.drones.get(droneId)
    if (drone) {
      drone.task.target_nest = targetNest
      drone.task.status = 'assigned'
      return true
    }
    return false
  }

  disconnectDrone(droneId) {
    const drone = this.drones.get(droneId)
    if (drone) {
      drone.signal.connected = false
      drone.signal.strength = 0
      return true
    }
    return false
  }

  reconnectDrone(droneId) {
    const drone = this.drones.get(droneId)
    if (drone) {
      drone.signal.connected = true
      drone.signal.strength = 95
      drone.signal.last_update = Date.now()
      return true
    }
    return false
  }
  
  getNests() {
    return this.dbData.nests.length > 0 ? this.dbData.nests : MemoryStore.nests
  }
}

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' })
    this.clients = new Set()
    this.simulator = new DroneSimulator()
    this.broadcastInterval = null
    this.initialized = false
  }

  async init() {
    await this.simulator.loadFromDatabase()
    this.initialized = true

    this.wss.on('connection', (ws, req) => {
      const user = this.authenticateRequest(req)
      if (!user) {
        ws.close(1008, 'Unauthorized')
        return
      }

      ws.user = user
      console.log('WebSocket客户端已连接')
      this.clients.add(ws)
      
      ws.isAlive = true
      ws.on('pong', () => {
        ws.isAlive = true
      })
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message)
          this.handleMessage(ws, data)
        } catch (error) {
          console.error('WebSocket消息解析错误:', error)
        }
      })
      
      ws.on('close', () => {
        console.log('WebSocket客户端已断开')
        this.clients.delete(ws)
      })
      
      ws.on('error', (error) => {
        console.error('WebSocket错误:', error)
        this.clients.delete(ws)
      })
      
      if (this.clients.size === 1) {
        this.simulator.start()
        this.startBroadcast()
      }
      
      this.sendInitialData(ws)
    })
    
    this.startHeartbeat()
  }

  authenticateRequest(req) {
    const authHeader = req.headers.authorization
    let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      const url = new URL(req.url, 'http://localhost')
      token = url.searchParams.get('token')
    }
    if (!token) return null

    try {
      return jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return null
    }
  }

  handleMessage(ws, data) {
    const { type, payload = {} } = data

    if (CONTROL_MESSAGE_TYPES.has(type) && !CONTROL_ROLES.has(ws.user?.role)) {
      this.sendToClient(ws, { type: 'error', payload: { message: '没有权限执行控制指令' } })
      return
    }

    switch (type) {
      case 'subscribe':
        ws.subscriptions = payload.drones || 'all'
        break
        
      case 'set_status':
        if (payload.drone_id && payload.status !== undefined) {
          this.simulator.setDroneStatus(payload.drone_id, payload.status)
        }
        break
        
      case 'apply_path':
        if (payload.drone_id && payload.waypoints) {
          this.simulator.applyPath(payload.drone_id, payload.waypoints)
        }
        break

      case 'set_target':
        if (payload.drone_id && payload.target_nest) {
          this.simulator.setDroneTarget(payload.drone_id, payload.target_nest)
        }
        break
        
      case 'disconnect_drone':
        if (payload.drone_id) {
          this.simulator.disconnectDrone(payload.drone_id)
        }
        break
        
      case 'reconnect_drone':
        if (payload.drone_id) {
          this.simulator.reconnectDrone(payload.drone_id)
        }
        break
        
      case 'get_trajectory':
        if (payload.drone_id) {
          const trajectory = this.simulator.getTrajectory(
            payload.drone_id,
            payload.start_time,
            payload.end_time
          )
          this.sendToClient(ws, {
            type: 'trajectory',
            payload: {
              drone_id: payload.drone_id,
              trajectory
            }
          })
        }
        break
        
      case 'ping':
        this.sendToClient(ws, { type: 'pong', payload: { timestamp: Date.now() } })
        break

      default:
        this.sendToClient(ws, { type: 'error', payload: { message: `未知消息类型: ${type}` } })
    }
  }

  sendInitialData(ws) {
    const drones = this.simulator.getAllDrones().map(({ path, pathIndex, trajectory, ...d }) => d)
    const nests = this.simulator.getNests().map(n => ({
      nest_id: n.nest_id,
      nest_name: n.nest_name || n.nest_id,
      name: n.nest_name || n.nest_id,
      longitude: parseFloat(n.longitude),
      latitude: parseFloat(n.latitude),
      status: n.status,
      charge_power: n.charge_power,
      max_drones: n.max_drones || 2,
      current_charging: n.current_charging || 0,
      available_slots: Math.max(0, (n.max_drones || 2) - (n.current_charging || 0))
    }))
    
    this.sendToClient(ws, {
      type: 'init',
      payload: { drones, nests }
    })
  }

  startBroadcast() {
    if (this.broadcastInterval) return
    
    this.broadcastInterval = setInterval(() => {
      this.broadcast()
    }, 1000)
  }

  stopBroadcast() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval)
      this.broadcastInterval = null
    }
  }

  broadcast() {
    if (this.clients.size === 0) {
      this.stopBroadcast()
      this.simulator.stop()
      return
    }

    const drones = this.simulator.getAllDrones().map(({ path, pathIndex, trajectory, ...d }) => d)

    this.broadcastToAll({
      type: 'update',
      payload: {
        timestamp: Date.now(),
        drones
      }
    })
  }

  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  broadcastToAll(data) {
    const message = JSON.stringify(data)
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  }

  startHeartbeat() {
    setInterval(() => {
      this.wss.clients.forEach(ws => {
        if (!ws.isAlive) {
          return ws.terminate()
        }
        ws.isAlive = false
        ws.ping()
      })
    }, 30000)
  }

  getSimulator() {
    return this.simulator
  }

  async reloadNests() {
    try {
      const [nests] = await pool.query('SELECT * FROM nests')
      this.simulator.dbData.nests = nests
      // 广播最新机巢数据给所有客户端
      const nestsPayload = nests.map(n => ({
        nest_id: n.nest_id,
        nest_name: n.nest_name || n.nest_id,
        name: n.nest_name || n.nest_id,
        longitude: parseFloat(n.longitude),
        latitude: parseFloat(n.latitude),
        status: n.status,
        charge_power: n.charge_power,
        max_drones: n.max_drones || 2,
        current_charging: n.current_charging || 0,
        available_slots: Math.max(0, (n.max_drones || 2) - (n.current_charging || 0))
      }))
      this.broadcastToAll({ type: 'nests_update', payload: { nests: nestsPayload } })
    } catch (error) {
      console.error('重新加载机巢数据失败:', error.message)
    }
  }
}

module.exports = { WebSocketServer, DroneSimulator }
