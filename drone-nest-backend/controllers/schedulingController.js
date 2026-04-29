const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')
const { DroneSimulator } = require('../services/websocketService')
const { spawn } = require('child_process')
const path = require('path')

let simulatorInstance = null

const getSimulator = () => {
  if (!simulatorInstance) {
    simulatorInstance = new DroneSimulator()
  }
  return simulatorInstance
}

const schedulingState = {
  isRunning: false,
  isPaused: false,
  startTime: null,
  metrics: {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    avgWaitTime: 0,
    avgExecutionTime: 0
  }
}

const simulationState = {
  isRunning: false,
  isPaused: false,
  startTime: null,
  config: {
    droneCount: 8,
    nestCount: 10,
    taskInterval: 5000,
    simulationSpeed: 1
  }
}

let currentAlgorithm = 'gat_ppo'

const runGatPpoInference = (payload) => new Promise((resolve, reject) => {
  const pythonCommand = process.env.GAT_PPO_PYTHON || process.env.PYTHON || 'python'
  const scriptPath = process.env.GAT_PPO_INFERENCE_SCRIPT || path.resolve(__dirname, '../../drone-nest-algorithm/gat_ppo_inference.py')
  const child = spawn(pythonCommand, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  })

  let stdout = ''
  let stderr = ''
  const timeout = setTimeout(() => {
    child.kill()
    reject(new Error('GAT-PPO推理超时'))
  }, Number(process.env.GAT_PPO_TIMEOUT_MS || 15000))

  child.stdout.on('data', data => { stdout += data.toString() })
  child.stderr.on('data', data => { stderr += data.toString() })
  child.on('error', error => {
    clearTimeout(timeout)
    reject(error)
  })
  child.on('close', code => {
    clearTimeout(timeout)
    if (code !== 0) {
      reject(new Error(stderr || `GAT-PPO推理进程退出: ${code}`))
      return
    }
    try {
      resolve(JSON.parse(stdout))
    } catch (error) {
      reject(new Error(`GAT-PPO推理输出解析失败: ${error.message}`))
    }
  })

  child.stdin.write(JSON.stringify(payload))
  child.stdin.end()
})

const getAvailableNests = (nests) => nests.filter(n => n.status === 1 && (n.max_drones || 2) > (n.current_charging || 0))

const EARTH_RADIUS = 6371000

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

const getNearestNest = (drone, availableNests) => {
  let targetNest = availableNests[0]
  if (drone?.position) {
    let minDist = Infinity
    availableNests.forEach(nest => {
      const dist = haversineDistance(
        drone.position.lat, drone.position.lng,
        parseFloat(nest.latitude) || 0, parseFloat(nest.longitude) || 0
      )
      if (dist < minDist) { minDist = dist; targetNest = nest }
    })
  }
  return targetNest
}

const buildAssignment = (droneId, targetNest, advantageValue, drone) => {
  const currentBattery = drone?.current_battery || 0
  const chargePower = targetNest.charge_power || 1500
  const remainingBattery = 100 - currentBattery
  const chargeRate = chargePower / 1500
  const estimatedChargeTime = Math.ceil(remainingBattery * 0.5 / chargeRate)
  const estimatedWaitTime = (targetNest.current_charging || 0) * estimatedChargeTime

  return {
    drone_id: droneId,
    nest_id: targetNest.nest_id,
    nest_name: targetNest.nest_name || targetNest.nest_id,
    estimated_wait_time: estimatedWaitTime,
    estimated_charge_time: estimatedChargeTime,
    advantage_value: advantageValue ?? 0
  }
}

const buildNearestAssignments = (droneIds, nests, simulator) => {
  const assignments = []
  const occupied = new Map()

  for (const droneId of droneIds) {
    const droneData = simulator.getDroneData(droneId)
    if (droneData && droneData.status === 2) continue

    const availableNests = getAvailableNests(nests).filter(nest => {
      const used = occupied.get(nest.nest_id) || 0
      return (nest.max_drones || 2) > (nest.current_charging || 0) + used
    })

    if (availableNests.length > 0) {
      const drone = simulator.getDroneData(droneId)
      const targetNest = getNearestNest(drone, availableNests)
      occupied.set(targetNest.nest_id, (occupied.get(targetNest.nest_id) || 0) + 1)
      assignments.push(buildAssignment(droneId, targetNest, null, drone))
    }
  }

  return assignments
}

const buildGatPpoAssignments = async (droneIds, nests, simulator, priority) => {
  const selectedDrones = droneIds.map(droneId => {
    const raw = simulator.getDroneData(droneId) || { drone_id: droneId }
    return {
      drone_id: droneId,
      latitude: raw.position?.lat ?? raw.latitude ?? 0,
      longitude: raw.position?.lng ?? raw.longitude ?? 0,
      battery_level: raw.battery?.current ?? raw.current_battery ?? raw.battery_level ?? 50,
      status: raw.status ?? 0,
      priority
    }
  })
  const result = await runGatPpoInference({ drones: selectedDrones, nests })
  const nestsById = new Map(nests.map(nest => [nest.nest_id, nest]))
  const assignments = []

  for (const item of result.assignments || []) {
    const targetNest = nestsById.get(item.nest_id)
    if (targetNest) {
      const droneData = selectedDrones.find(d => d.drone_id === item.drone_id)
      assignments.push(buildAssignment(item.drone_id, targetNest, item.score, droneData))
    }
  }

  return assignments
}

if (!MemoryStore.schedulingRecords) {
  MemoryStore.schedulingRecords = [
    {
      id: 1,
      record_id: 'SR001',
      task_type: 'charge',
      drone_id: 'DR001',
      nest_id: 'NT001',
      status: 'completed',
      priority: 1,
      scheduled_time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      start_time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString(),
      wait_time: 120,
      execution_time: 1800,
      create_time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 2,
      record_id: 'SR002',
      task_type: 'charge',
      drone_id: 'DR003',
      nest_id: 'NT003',
      status: 'running',
      priority: 2,
      scheduled_time: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      start_time: new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString(),
      end_time: null,
      wait_time: 1800,
      execution_time: null,
      create_time: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    }
  ]
}

exports.runScheduling = async (req, res) => {
  try {
    const { drones, optimization_type, constraints, algorithm } = req.body

    if (!drones || !Array.isArray(drones) || drones.length === 0) {
      return res.status(400).json({ code: 400, message: '无人机列表不能为空', data: null })
    }

    const record_id = 'SR' + Date.now().toString().slice(-6)
    const task_type = optimization_type || 'charge'
    const priority = constraints?.priority || 1
    const selectedAlgorithm = algorithm || currentAlgorithm
    const simulator = getSimulator()
    const nests = simulator.getNests()
    let assignments = []
    let usedAlgorithm = selectedAlgorithm

    if (selectedAlgorithm === 'gat_ppo') {
      try {
        assignments = await buildGatPpoAssignments(drones, nests, simulator, priority)
      } catch (error) {
        console.warn('GAT-PPO scheduling failed, falling back to nearest:', error.message)
      }
    }

    if (assignments.length === 0) {
      usedAlgorithm = 'nearest'
      assignments = buildNearestAssignments(drones, nests, simulator)
    }

    currentAlgorithm = usedAlgorithm
    assignments.forEach(assignment => {
      simulator.setDroneTarget(assignment.drone_id, assignment.nest_id)
      simulator.setDroneStatus(assignment.drone_id, 1)
    })

    try {
      const [result] = await pool.query(
        'INSERT INTO scheduling_records (record_id, task_type, drone_ids, assignments, priority, status, create_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [record_id, task_type, JSON.stringify(drones), JSON.stringify(assignments), priority, 'pending', new Date().toISOString()]
      )

      schedulingState.metrics.totalTasks += drones.length

      res.json({
        code: 200,
        message: '调度任务已创建',
        data: {
          record_id,
          task_type,
          algorithm: usedAlgorithm,
          total_drones: drones.length,
          assignments,
          status: 'pending'
        }
      })
    } catch (dbError) {
      const record = {
        id: MemoryStore.schedulingRecords.length + 1,
        record_id,
        task_type,
        drone_ids: drones,
        assignments,
        priority,
        status: 'pending',
        create_time: new Date().toISOString()
      }
      MemoryStore.schedulingRecords.push(record)

      schedulingState.metrics.totalTasks += drones.length

      res.json({
        code: 200,
        message: '调度任务已创建',
        data: {
          record_id,
          task_type,
          algorithm: usedAlgorithm,
          total_drones: drones.length,
          assignments,
          status: 'pending'
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.startScheduler = async (req, res) => {
  try {
    if (schedulingState.isRunning) {
      return res.status(400).json({ code: 400, message: '调度器已在运行中', data: null })
    }

    schedulingState.isRunning = true
    schedulingState.isPaused = false
    schedulingState.startTime = new Date().toISOString()

    res.json({
      code: 200,
      message: '调度器已启动',
      data: {
        is_running: true,
        is_paused: false,
        start_time: schedulingState.startTime
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.stopScheduler = async (req, res) => {
  try {
    if (!schedulingState.isRunning) {
      return res.status(400).json({ code: 400, message: '调度器未在运行', data: null })
    }

    schedulingState.isRunning = false
    schedulingState.isPaused = false

    res.json({
      code: 200,
      message: '调度器已停止',
      data: {
        is_running: false,
        is_paused: false,
        stop_time: new Date().toISOString()
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getSchedulerStatus = async (req, res) => {
  try {
    res.json({
      code: 200,
      message: '获取成功',
      data: {
        is_running: schedulingState.isRunning,
        is_paused: schedulingState.isPaused,
        start_time: schedulingState.startTime,
        uptime: schedulingState.startTime ? Date.now() - new Date(schedulingState.startTime).getTime() : 0,
        dispatch_interval: 30,
        algorithm: currentAlgorithm
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getMetrics = async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    try {
      let sql = 'SELECT * FROM scheduling_records WHERE 1=1'
      const params = []

      if (start_date) {
        sql += ' AND create_time >= ?'
        params.push(start_date)
      }
      if (end_date) {
        sql += ' AND create_time <= ?'
        params.push(end_date)
      }

      const [rows] = await pool.query(sql, params)

      const totalTasks = rows.length
      const completedTasks = rows.filter(r => r.status === 'completed').length
      const failedTasks = rows.filter(r => r.status === 'failed').length
      const runningTasks = rows.filter(r => r.status === 'running' || r.status === 'pending').length

      const avgWaitTime = rows.filter(r => r.wait_time).reduce((sum, r) => sum + r.wait_time, 0) / (rows.filter(r => r.wait_time).length || 1)
      const avgExecutionTime = rows.filter(r => r.execution_time).reduce((sum, r) => sum + r.execution_time, 0) / (rows.filter(r => r.execution_time).length || 1)

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          failed_tasks: failedTasks,
          running_tasks: runningTasks,
          avg_wait_time: Math.round(avgWaitTime),
          avg_execution_time: Math.round(avgExecutionTime),
          success_rate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
        }
      })
    } catch (dbError) {
      const records = MemoryStore.schedulingRecords

      const totalTasks = records.length
      const completedTasks = records.filter(r => r.status === 'completed').length
      const failedTasks = records.filter(r => r.status === 'failed').length
      const runningTasks = records.filter(r => r.status === 'running' || r.status === 'pending').length

      const avgWaitTime = records.filter(r => r.wait_time).reduce((sum, r) => sum + r.wait_time, 0) / (records.filter(r => r.wait_time).length || 1)
      const avgExecutionTime = records.filter(r => r.execution_time).reduce((sum, r) => sum + r.execution_time, 0) / (records.filter(r => r.execution_time).length || 1)

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          failed_tasks: failedTasks,
          running_tasks: runningTasks,
          avg_wait_time: Math.round(avgWaitTime),
          avg_execution_time: Math.round(avgExecutionTime),
          success_rate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.startSimulation = async (req, res) => {
  try {
    const { droneCount, nestCount, taskInterval, simulationSpeed } = req.body

    if (simulationState.isRunning) {
      return res.status(400).json({ code: 400, message: '模拟已在运行中', data: null })
    }

    simulationState.isRunning = true
    simulationState.isPaused = false
    simulationState.startTime = new Date().toISOString()

    if (droneCount) simulationState.config.droneCount = droneCount
    if (nestCount) simulationState.config.nestCount = nestCount
    if (taskInterval) simulationState.config.taskInterval = taskInterval
    if (simulationSpeed) simulationState.config.simulationSpeed = simulationSpeed

    const simulator = getSimulator()
    simulator.start()

    res.json({
      code: 200,
      message: '模拟已启动',
      data: {
        is_running: true,
        config: simulationState.config,
        start_time: simulationState.startTime
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.stopSimulation = async (req, res) => {
  try {
    if (!simulationState.isRunning) {
      return res.status(400).json({ code: 400, message: '模拟未在运行', data: null })
    }

    const simulator = getSimulator()
    simulator.stop()

    simulationState.isRunning = false
    simulationState.isPaused = false

    res.json({
      code: 200,
      message: '模拟已停止',
      data: {
        is_running: false,
        stop_time: new Date().toISOString(),
        duration: simulationState.startTime ? Date.now() - new Date(simulationState.startTime).getTime() : 0
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getSimulationStatus = async (req, res) => {
  try {
    const simulator = getSimulator()
    const drones = simulator.getAllDrones()

    res.json({
      code: 200,
      message: '获取成功',
      data: {
        is_running: simulationState.isRunning,
        is_paused: simulationState.isPaused,
        start_time: simulationState.startTime,
        config: simulationState.config,
        uptime: simulationState.startTime ? Date.now() - new Date(simulationState.startTime).getTime() : 0,
        active_drones: drones.filter(d => d.status === 1).length,
        total_drones: drones.length
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}