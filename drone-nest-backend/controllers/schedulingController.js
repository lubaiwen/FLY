const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')
const { DroneSimulator } = require('../services/websocketService')

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
    const { drones, optimization_type, constraints } = req.body

    if (!drones || !Array.isArray(drones) || drones.length === 0) {
      return res.status(400).json({ code: 400, message: '无人机列表不能为空', data: null })
    }

    const record_id = 'SR' + Date.now().toString().slice(-6)
    const task_type = optimization_type || 'charge'
    const priority = constraints?.priority || 1

    const assignments = []
    const simulator = getSimulator()
    const nests = simulator.getNests()

    for (const droneId of drones) {
      const availableNests = nests.filter(n => n.status === 1 && (n.available_slots || (n.max_drones || 2)) > (n.current_drones || 0))

      if (availableNests.length > 0) {
        const targetNest = availableNests[Math.floor(Math.random() * availableNests.length)]
        assignments.push({
          drone_id: droneId,
          nest_id: targetNest.nest_id,
          estimated_wait_time: Math.floor(Math.random() * 300) + 60,
          estimated_charge_time: Math.floor(Math.random() * 60) + 30
        })
        simulator.setDroneTarget(droneId, targetNest.nest_id)
      }
    }

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
        uptime: schedulingState.startTime ? Date.now() - new Date(schedulingState.startTime).getTime() : 0
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