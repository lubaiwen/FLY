const MemoryStore = require('../store/memoryStore')
const { pool } = require('../config/database')

// 从数据库获取无人机，失败时回退 MemoryStore
const getDrone = async (drone_id) => {
  try {
    const [rows] = await pool.query('SELECT * FROM drones WHERE drone_id = ?', [drone_id])
    return rows[0] || null
  } catch {
    return MemoryStore.drones.find(d => d.drone_id === drone_id) || null
  }
}

// 从数据库获取机巢，失败时回退 MemoryStore
const getNest = async (nest_id) => {
  try {
    const [rows] = await pool.query('SELECT * FROM nests WHERE nest_id = ?', [nest_id])
    return rows[0] || null
  } catch {
    return MemoryStore.nests.find(n => n.nest_id === nest_id) || null
  }
}

// 从数据库获取所有机巢，失败时回退 MemoryStore
const getAllNests = async (filter = {}) => {
  try {
    let sql = 'SELECT * FROM nests WHERE 1=1'
    const params = []
    if (filter.status !== undefined) {
      sql += ' AND status = ?'
      params.push(filter.status)
    }
    const [rows] = await pool.query(sql, params)
    return rows
  } catch {
    let nests = MemoryStore.nests
    if (filter.status !== undefined) nests = nests.filter(n => n.status === filter.status)
    return nests
  }
}

// 从数据库获取所有无人机，失败时回退 MemoryStore
const getAllDrones = async (filter = {}) => {
  try {
    let sql = 'SELECT * FROM drones WHERE 1=1'
    const params = []
    if (filter.statusNot !== undefined) {
      sql += ' AND status != ?'
      params.push(filter.statusNot)
    }
    const [rows] = await pool.query(sql, params)
    return rows
  } catch {
    let drones = MemoryStore.drones
    if (filter.statusNot !== undefined) drones = drones.filter(d => d.status !== filter.statusNot)
    return drones
  }
}

const EARTH_RADIUS = 6371000

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

const calculateBearing = (lat1, lon1, lat2, lon2) => {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  const bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

const interpolatePosition = (lat1, lon1, lat2, lon2, fraction) => {
  const lat = lat1 + (lat2 - lat1) * fraction
  const lng = lon1 + (lon2 - lon1) * fraction
  return { lat, lng }
}

const calculateBatteryConsumption = (distance, speed = 10, windFactor = 1.0) => {
  const baseConsumption = 0.15
  const distanceKm = distance / 1000
  const timeHours = distanceKm / speed
  return baseConsumption * timeHours * 60 * windFactor
}

const estimateTravelTime = (distance, speed = 10, windSpeed = 0, windDirection = 0, heading = 0) => {
  const windEffect = windSpeed * Math.cos((windDirection - heading) * Math.PI / 180) / 3.6
  const effectiveSpeed = Math.max(1, speed + windEffect * 0.1)
  return distance / effectiveSpeed
}

const generateStraightPath = (start, end, options = {}) => {
  const { altitude = 100, speed = 10, wind = {} } = options
  const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng)
  const bearing = calculateBearing(start.lat, start.lng, end.lat, end.lng)
  const duration = estimateTravelTime(distance, speed, wind.speed || 0, wind.direction || 0, bearing)
  const batteryConsumption = calculateBatteryConsumption(distance, speed, wind.factor || 1.0)

  const waypoints = []
  const numPoints = Math.max(2, Math.ceil(distance / 100))
  const startBattery = start.battery ?? 75

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints
    const pos = interpolatePosition(start.lat, start.lng, end.lat, end.lng, fraction)
    waypoints.push({
      index: i,
      position: { ...pos, altitude },
      distance: distance * fraction,
      time: duration * fraction,
      battery_remaining: Math.max(0, startBattery - batteryConsumption * fraction),
      timestamp: Date.now() + duration * fraction * 1000
    })
  }

  return {
    type: 'straight',
    waypoints,
    total_distance: distance,
    estimated_duration: duration,
    battery_consumption: batteryConsumption,
    battery_after_arrival: Math.max(0, startBattery - batteryConsumption),
    bearing,
    efficiency_score: calculateEfficiencyScore(distance, duration, batteryConsumption)
  }
}

const generatePolylinePath = (start, end, options = {}) => {
  const { altitude = 100, speed = 10, waypoints: customWaypoints = [], wind = {} } = options
  const midLat = (start.lat + end.lat) / 2
  const midLng = (start.lng + end.lng) / 2

  const controlPoints = customWaypoints.length > 0 ? customWaypoints : [
    { lat: midLat, lng: midLng }
  ]

  const allPoints = [start, ...controlPoints, end]
  const segments = []
  let totalDistance = 0
  const startBattery = start.battery ?? 75

  for (let i = 0; i < allPoints.length - 1; i++) {
    const segmentStart = allPoints[i]
    const segmentEnd = allPoints[i + 1]
    const segmentDistance = calculateDistance(
      segmentStart.lat, segmentStart.lng,
      segmentEnd.lat, segmentEnd.lng
    )
    totalDistance += segmentDistance

    const numPoints = Math.max(2, Math.ceil(segmentDistance / 100))
    for (let j = 0; j <= numPoints; j++) {
      if (i > 0 && j === 0) continue

      const fraction = j / numPoints
      const pos = interpolatePosition(
        segmentStart.lat, segmentStart.lng,
        segmentEnd.lat, segmentEnd.lng,
        fraction
      )

      const currentDistance = totalDistance - segmentDistance * (1 - fraction)
      const currentTime = estimateTravelTime(currentDistance, speed, wind.speed || 0, wind.direction || 0, 0)
      const batteryConsumptionSoFar = calculateBatteryConsumption(currentDistance, speed, wind.factor || 1.0)

      segments.push({
        index: segments.length,
        position: { ...pos, altitude },
        distance: currentDistance,
        time: currentTime,
        battery_remaining: Math.max(0, startBattery - batteryConsumptionSoFar),
        segment: i,
        timestamp: Date.now() + currentTime * 1000
      })
    }
  }

  const duration = estimateTravelTime(totalDistance, speed, wind.speed || 0, wind.direction || 0, 0)
  const batteryConsumption = calculateBatteryConsumption(totalDistance, speed, wind.factor || 1.0)

  return {
    type: 'polyline',
    waypoints: segments,
    control_points: controlPoints,
    total_distance: totalDistance,
    estimated_duration: duration,
    battery_consumption: batteryConsumption,
    battery_after_arrival: Math.max(0, startBattery - batteryConsumption),
    efficiency_score: calculateEfficiencyScore(totalDistance, duration, batteryConsumption)
  }
}

const generateCurvePath = (start, end, options = {}) => {
  const { altitude = 100, speed = 10, curvature = 0.3, wind = {} } = options
  const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng)
  const bearing = calculateBearing(start.lat, start.lng, end.lat, end.lng)

  if (distance < 1) {
    const startBattery = start.battery ?? 75
    return {
      type: 'curve',
      waypoints: [{
        index: 0,
        position: { lat: start.lat, lng: start.lng, altitude },
        distance: 0,
        time: 0,
        battery_remaining: startBattery,
        timestamp: Date.now(),
        curvature: 0
      }],
      control_point: { lat: start.lat, lng: start.lng },
      total_distance: 0,
      estimated_duration: 0,
      battery_consumption: 0,
      battery_after_arrival: startBattery,
      bearing,
      curvature,
      efficiency_score: 0
    }
  }

  const midLat = (start.lat + end.lat) / 2
  const midLng = (start.lng + end.lng) / 2
  const dLat = end.lat - start.lat
  const dLng = end.lng - start.lng
  const perpLat = -dLng * curvature * 0.5
  const perpLng = dLat * curvature * 0.5

  const controlLat = midLat + perpLat
  const controlLng = midLng + perpLng

  const waypoints = []
  const numPoints = Math.max(20, Math.ceil(distance / 50))
  let actualDistance = 0
  let prevPos = null
  const startBattery = start.battery ?? 75

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    const lat = Math.pow(1 - t, 2) * start.lat + 2 * (1 - t) * t * controlLat + Math.pow(t, 2) * end.lat
    const lng = Math.pow(1 - t, 2) * start.lng + 2 * (1 - t) * t * controlLng + Math.pow(t, 2) * end.lng

    if (prevPos) {
      actualDistance += calculateDistance(prevPos.lat, prevPos.lng, lat, lng)
    }
    prevPos = { lat, lng }

    const currentAltitude = altitude + Math.sin(t * Math.PI) * 20
    const currentDistance = actualDistance
    const currentTime = estimateTravelTime(currentDistance, speed, wind.speed || 0, wind.direction || 0, bearing)
    const batteryConsumption = calculateBatteryConsumption(actualDistance, speed, wind.factor || 1.0)

    waypoints.push({
      index: i,
      position: { lat, lng, altitude: currentAltitude },
      distance: currentDistance,
      time: currentTime,
      battery_remaining: Math.max(0, startBattery - batteryConsumption),
      timestamp: Date.now() + currentTime * 1000,
      curvature: Math.sin(t * Math.PI)
    })
  }

  const duration = estimateTravelTime(actualDistance, speed, wind.speed || 0, wind.direction || 0, bearing)
  const batteryConsumption = calculateBatteryConsumption(actualDistance, speed, wind.factor || 1.0)

  return {
    type: 'curve',
    waypoints,
    control_point: { lat: controlLat, lng: controlLng },
    total_distance: actualDistance,
    estimated_duration: duration,
    battery_consumption: batteryConsumption,
    battery_after_arrival: Math.max(0, startBattery - batteryConsumption),
    bearing,
    curvature,
    efficiency_score: calculateEfficiencyScore(actualDistance, duration, batteryConsumption)
  }
}

const calculateEfficiencyScore = (distance, duration, batteryConsumption) => {
  if (distance <= 0 || duration <= 0 || batteryConsumption <= 0) {
    return 0
  }
  const distanceScore = Math.min(100, 10000 / distance)
  const timeScore = Math.min(100, 600 / duration)
  const batteryScore = Math.min(100, 50 / batteryConsumption)
  return (distanceScore * 0.3 + timeScore * 0.3 + batteryScore * 0.4).toFixed(1)
}

const findBestNest = (dronePosition, droneBattery, nests, options = {}) => {
  const { maxDistance = 10000, minBatteryMargin = 20, preferAvailable = true } = options

  const scoredNests = nests.map(nest => {
    const nestLat = parseFloat(nest.latitude)
    const nestLng = parseFloat(nest.longitude)

    if (isNaN(nestLat) || isNaN(nestLng)) {
      return { nest, score: -1, reason: 'invalid_coordinates' }
    }

    const distance = calculateDistance(
      dronePosition.lat, dronePosition.lng,
      nestLat, nestLng
    )
    
    if (distance > maxDistance) {
      return { nest, score: -1, reason: 'distance_exceeded' }
    }
    
    const estimatedBatteryConsumption = calculateBatteryConsumption(distance)
    const batteryAfterArrival = droneBattery - estimatedBatteryConsumption
    
    if (batteryAfterArrival < minBatteryMargin) {
      return { nest, score: -1, reason: 'insufficient_battery' }
    }
    
    let score = 100
    
    if (preferAvailable && nest.status !== 1) {
      score -= 50
    }
    
    score -= (distance / maxDistance) * 30
    score += (batteryAfterArrival / 2)
    
    if (nest.current_charging > 0) {
      score -= nest.current_charging * 10
    }
    
    return {
      nest,
      score: Math.max(0, score),
      distance,
      estimated_battery_consumption: estimatedBatteryConsumption,
      battery_after_arrival: batteryAfterArrival,
      reason: 'valid'
    }
  })
  
  const validNests = scoredNests.filter(n => n.score >= 0)
  validNests.sort((a, b) => b.score - a.score)
  
  return validNests
}

const runGatPpoMatching = (drones, nests) => new Promise((resolve, reject) => {
  const { spawn } = require('child_process')
  const path = require('path')
  
  const pythonCommand = process.env.GAT_PPO_PYTHON || process.env.PYTHON || 'python'
  const scriptPath = process.env.GAT_PPO_INFERENCE_SCRIPT || path.resolve(__dirname, '../../drone-nest-algorithm/gat_ppo_inference.py')
  
  const payload = {
    drones: drones.map(d => ({
      drone_id: d.drone_id,
      battery: (d.battery?.current || d.current_battery || 50) / 100,
      status: d.status === 0 ? 'idle' : d.status === 1 ? 'flying' : d.status === 2 ? 'charging' : 'idle',
      position: {
        lng: parseFloat(d.longitude) || 0,
        lat: parseFloat(d.latitude) || 0
      },
      priority: d.priority || 1
    })),
    nests: nests.map(n => ({
      nest_id: n.nest_id,
      status: n.status,
      max_drones: n.max_drones || 2,
      current_charging: n.current_charging || 0,
      longitude: parseFloat(n.longitude) || 0,
      latitude: parseFloat(n.latitude) || 0
    }))
  }

  const child = spawn(pythonCommand, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  })

  let stdout = ''
  let stderr = ''
  const timeout = setTimeout(() => {
    child.kill()
    reject(new Error('GAT-PPO匹配超时'))
  }, 15000)

  child.stdout.on('data', data => { stdout += data.toString() })
  child.stderr.on('data', data => { stderr += data.toString() })
  child.on('error', error => {
    clearTimeout(timeout)
    reject(error)
  })
  child.on('close', code => {
    clearTimeout(timeout)
    if (code !== 0) {
      reject(new Error(stderr || `GAT-PPO匹配进程退出: ${code}`))
      return
    }
    try {
      const result = JSON.parse(stdout)
      resolve(result.assignments || [])
    } catch (error) {
      reject(new Error(`GAT-PPO匹配输出解析失败: ${error.message}`))
    }
  })

  child.stdin.write(JSON.stringify(payload))
  child.stdin.end()
})

const intelligentMatch = async (drones, nests, options = {}) => {
  const { algorithm = 'gat_ppo', objective = 'min_total_distance' } = options
  const nestById = new Map(nests.map(n => [n.nest_id, n]))

  if (algorithm === 'gat_ppo') {
    try {
      const gatPpoAssignments = await runGatPpoMatching(drones, nests)
      const assignments = []
      const unmatchedDrones = []
      const usedCapacity = new Map()

      for (const item of gatPpoAssignments) {
        const drone = drones.find(d => d.drone_id === item.drone_id)
        const nest = nestById.get(item.nest_id)
        
        if (!drone || !nest) continue
        
        const droneLat = parseFloat(drone.latitude) || parseFloat(drone.position?.lat) || 0
        const droneLng = parseFloat(drone.longitude) || parseFloat(drone.position?.lng) || 0
        const nestLat = parseFloat(nest.latitude) || 0
        const nestLng = parseFloat(nest.longitude) || 0
        
        if (isNaN(droneLat) || isNaN(droneLng)) continue
        
        const capacity = nest.max_drones || 2
        const currentUsed = usedCapacity.get(item.nest_id) || (nest.current_charging || 0)
        
        if (currentUsed >= capacity) continue
        
        usedCapacity.set(item.nest_id, currentUsed + 1)
        
        const dronePos = { lat: droneLat, lng: droneLng }
        const droneBattery = drone.battery?.current || drone.current_battery || 50
        
        const distance = calculateDistance(dronePos.lat, dronePos.lng, nestLat, nestLng)
        const estimated_battery_consumption = calculateBatteryConsumption(distance)
        const battery_after_arrival = Math.max(0, droneBattery - estimated_battery_consumption)

        const path = generateStraightPath(dronePos, { lat: nestLat, lng: nestLng }, { speed: options.speed || 10 })
        path.drone_id = drone.drone_id

        assignments.push({
          drone_id: drone.drone_id,
          nest_id: nest.nest_id,
          nest_name: nest.nest_name || nest.nest_id,
          score: item.score || 100,
          distance,
          estimated_battery_consumption,
          battery_after_arrival,
          path,
          match_reason: 'gat_ppo_algorithm'
        })
      }
      
      const matchedDrones = new Set(assignments.map(a => a.drone_id))
      drones.forEach(d => {
        if (!matchedDrones.has(d.drone_id)) {
          unmatchedDrones.push({ drone_id: d.drone_id, reason: 'not_selected_by_algorithm' })
        }
      })

      const totalDistance = assignments.reduce((sum, a) => sum + a.distance, 0)
      const totalBatteryConsumption = assignments.reduce((sum, a) => sum + a.estimated_battery_consumption, 0)
      
      return {
        assignments,
        unmatchedDrones,
        algorithm: 'gat_ppo',
        objective,
        summary: {
          total_drones: drones.length,
          total_nests: nests.length,
          total_assignments: assignments.length,
          total_distance: totalDistance,
          total_battery_consumption: totalBatteryConsumption,
          average_distance: assignments.length > 0 ? totalDistance / assignments.length : 0,
          efficiency_score: assignments.length > 0 ?
            (assignments.reduce((sum, a) => sum + parseFloat(a.path.efficiency_score || 0), 0) / assignments.length).toFixed(1) : 0,
          unmatched_count: unmatchedDrones.length
        }
      }
    } catch (error) {
      console.warn('GAT-PPO匹配失败，回退到贪心算法:', error.message)
    }
  }

  const assignments = []
  const unmatchedDrones = []
  const usedCapacity = new Map()
  const sortedDrones = [...drones].filter(d => d.status !== 2).sort((a, b) => {
    const batteryA = a.battery?.current || a.current_battery || 50
    const batteryB = b.battery?.current || b.current_battery || 50
    return batteryA - batteryB
  })

  for (const drone of sortedDrones) {
    const droneLat = parseFloat(drone.latitude) || parseFloat(drone.position?.lat) || 0
    const droneLng = parseFloat(drone.longitude) || parseFloat(drone.position?.lng) || 0

    if (isNaN(droneLat) || isNaN(droneLng)) {
      continue
    }

    const dronePos = { lat: droneLat, lng: droneLng }
    const droneBattery = drone.battery?.current || drone.current_battery || 50

    const availableNests = nests.filter(n => {
      const nestLat = parseFloat(n.latitude)
      const nestLng = parseFloat(n.longitude)
      if (isNaN(nestLat) || isNaN(nestLng)) return false
      const capacity = n.max_drones || 2
      const currentUsed = usedCapacity.get(n.nest_id) || (n.current_charging || 0)
      return currentUsed < capacity
    })

    if (availableNests.length === 0) {
      const allNests = nests.filter(n => {
        const nestLat = parseFloat(n.latitude)
        const nestLng = parseFloat(n.longitude)
        return !isNaN(nestLat) && !isNaN(nestLng)
      })
      if (allNests.length > 0) {
        const bestNests = findBestNest(dronePos, droneBattery, allNests, {
          maxDistance: options.maxDistance || 15000,
          minBatteryMargin: options.minBatteryMargin || 5
        })
        if (bestNests.length > 0) {
          const best = bestNests[0]
          usedCapacity.set(best.nest.nest_id, (usedCapacity.get(best.nest.nest_id) || best.nest.current_charging || 0) + 1)
          const bestNestLat = parseFloat(best.nest.latitude)
          const bestNestLng = parseFloat(best.nest.longitude)
          const path = generateStraightPath(dronePos, {
            lat: bestNestLat,
            lng: bestNestLng
          }, { speed: options.speed || 10 })
          path.drone_id = drone.drone_id
          assignments.push({
            drone_id: drone.drone_id,
            nest_id: best.nest.nest_id,
            nest_name: best.nest.nest_name || best.nest.nest_id,
            score: best.score,
            distance: best.distance,
            estimated_battery_consumption: best.estimated_battery_consumption,
            battery_after_arrival: best.battery_after_arrival,
            path,
            match_reason: 'fallback_used'
          })
          continue
        }
      }
      unmatchedDrones.push({ drone_id: drone.drone_id, reason: 'no_available_nest' })
      continue
    }

    const bestNests = findBestNest(dronePos, droneBattery, availableNests, {
      maxDistance: options.maxDistance || 15000,
      minBatteryMargin: options.minBatteryMargin || 15
    })

    if (bestNests.length > 0) {
      const best = bestNests[0]
      usedCapacity.set(best.nest.nest_id, (usedCapacity.get(best.nest.nest_id) || best.nest.current_charging || 0) + 1)

      const bestNestLat = parseFloat(best.nest.latitude)
      const bestNestLng = parseFloat(best.nest.longitude)

      const path = generateStraightPath(dronePos, {
        lat: bestNestLat,
        lng: bestNestLng
      }, { speed: options.speed || 10 })
      path.drone_id = drone.drone_id

      assignments.push({
        drone_id: drone.drone_id,
        nest_id: best.nest.nest_id,
        nest_name: best.nest.nest_name || best.nest.nest_id,
        score: best.score,
        distance: best.distance,
        estimated_battery_consumption: best.estimated_battery_consumption,
        battery_after_arrival: best.battery_after_arrival,
        path,
        match_reason: best.reason
      })
    } else {
      unmatchedDrones.push({ drone_id: drone.drone_id, reason: 'battery_insufficient' })
    }
  }

  const totalDistance = assignments.reduce((sum, a) => sum + a.distance, 0)
  const totalBatteryConsumption = assignments.reduce((sum, a) => sum + a.estimated_battery_consumption, 0)

  return {
    algorithm: algorithm === 'gat_ppo' ? 'greedy_fallback' : 'greedy',
    objective,
    assignments,
    unmatchedDrones,
    summary: {
      total_drones: drones.length,
      total_nests: nests.length,
      total_assignments: assignments.length,
      total_distance: totalDistance,
      total_battery_consumption: totalBatteryConsumption,
      average_distance: assignments.length > 0 ? totalDistance / assignments.length : 0,
      efficiency_score: assignments.length > 0 ?
        (assignments.reduce((sum, a) => sum + parseFloat(a.path.efficiency_score || 0), 0) / assignments.length).toFixed(1) : 0,
      unmatched_count: unmatchedDrones.length
    }
  }
}

const planPath = async (req, res) => {
  try {
    const { drone_id, nest_id, path_type = 'straight', options = {}, start_position } = req.body

    if (!drone_id || !nest_id) {
      return res.status(400).json({ code: 400, message: '缺少无人机ID或机巢ID', data: null })
    }

    const drone = await getDrone(drone_id)
    const nest = await getNest(nest_id)

    if (!drone) return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
    if (!nest) return res.status(404).json({ code: 404, message: '机巢不存在', data: null })

    const droneLat = parseFloat(drone.latitude)
    const droneLng = parseFloat(drone.longitude)
    if (isNaN(droneLat) || isNaN(droneLng)) {
      return res.status(400).json({ code: 400, message: '无人机位置信息无效', data: null })
    }

    const nestLat = parseFloat(nest.latitude)
    const nestLng = parseFloat(nest.longitude)
    if (isNaN(nestLat) || isNaN(nestLng)) {
      return res.status(400).json({ code: 400, message: '机巢位置信息无效', data: null })
    }

    const start = start_position || {
      lat: droneLat,
      lng: droneLng,
      battery: drone.current_battery || 75
    }

    const end = {
      lat: nestLat,
      lng: nestLng
    }

    let path
    switch (path_type) {
      case 'polyline': path = generatePolylinePath(start, end, options); break
      case 'curve': path = generateCurvePath(start, end, options); break
      default: path = generateStraightPath(start, end, options)
    }

    res.json({
      code: 200,
      message: '路径规划成功',
      data: {
        plan_id: `PLAN${Date.now()}`,
        drone_id,
        nest_id,
        nest_name: nest.nest_name || nest_id,
        start_position: start,
        end_position: end,
        path_type,
        ...path,
        created_at: new Date().toISOString()
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getMultiplePaths = async (req, res) => {
  try {
    const { assignments } = req.body

    if (!assignments || !Array.isArray(assignments)) {
      return res.status(400).json({ code: 400, message: '缺少分配信息', data: null })
    }

    const paths = (await Promise.all(assignments.map(async ({ drone_id, nest_id, path_type = 'straight' }) => {
      const drone = await getDrone(drone_id)
      const nest = await getNest(nest_id)
      if (!drone || !nest) return null

      const droneLat = parseFloat(drone.latitude)
      const droneLng = parseFloat(drone.longitude)
      const nestLat = parseFloat(nest.latitude)
      const nestLng = parseFloat(nest.longitude)

      if (isNaN(droneLat) || isNaN(droneLng) || isNaN(nestLat) || isNaN(nestLng)) {
        return null
      }

      const start = { lat: droneLat, lng: droneLng }
      const end = { lat: nestLat, lng: nestLng }

      let path
      switch (path_type) {
        case 'polyline': path = generatePolylinePath(start, end); break
        case 'curve': path = generateCurvePath(start, end); break
        default: path = generateStraightPath(start, end)
      }

      return { drone_id, nest_id, path_type, ...path }
    }))).filter(p => p !== null)

    res.json({ code: 200, message: '批量路径规划成功', data: paths })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const optimizePaths = async (req, res) => {
  try {
    const { drone_ids, nest_ids, objective = 'min_distance', options = {} } = req.body

    if (!drone_ids || !nest_ids) {
      return res.status(400).json({ code: 400, message: '缺少无人机或机巢信息', data: null })
    }

    const drones = (await Promise.all(drone_ids.map(id => getDrone(id)))).filter(Boolean)
    const nests = (await Promise.all(nest_ids.map(id => getNest(id)))).filter(Boolean)

    const result = await intelligentMatch(drones, nests, { ...options, objective })
    res.json({ code: 200, message: '路径优化成功', data: result })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const intelligentMatchHandler = async (req, res) => {
  try {
    const { drone_ids, options = {} } = req.body

    let drones
    if (drone_ids && Array.isArray(drone_ids) && drone_ids.length > 0) {
      drones = (await Promise.all(drone_ids.map(id => getDrone(id)))).filter(Boolean)
      drones = drones.filter(d => d.status !== 1 && d.status !== 2)
    } else {
      drones = await getAllDrones({ statusNot: 2 })
      drones = drones.filter(d => d.status !== 1)
    }
    
    const nests = await getAllNests({ status: 1 })

    const result = await intelligentMatch(drones, nests, options)
    res.json({ code: 200, message: '智能匹配成功', data: result })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getBestNestForDrone = async (req, res) => {
  try {
    const { drone_id } = req.params
    const { max_distance, min_battery_margin } = req.query

    const drone = await getDrone(drone_id)
    if (!drone) return res.status(404).json({ code: 404, message: '无人机不存在', data: null })

    const dronePos = {
      lat: parseFloat(drone.latitude) || 31.8206,
      lng: parseFloat(drone.longitude) || 117.2272
    }
    const droneBattery = drone.current_battery || 50

    const nests = await getAllNests()
    const bestNests = findBestNest(dronePos, droneBattery, nests, {
      maxDistance: parseFloat(max_distance) || 15000,
      minBatteryMargin: parseFloat(min_battery_margin) || 15
    })

    res.json({
      code: 200,
      message: '查询成功',
      data: {
        drone_id,
        current_position: dronePos,
        current_battery: droneBattery,
        recommended_nests: bestNests.slice(0, 5)
      }
    })
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

module.exports = {
  planPath,
  getMultiplePaths,
  optimizePaths,
  intelligentMatchHandler,
  getBestNestForDrone,
  calculateDistance,
  calculateBearing,
  findBestNest,
  intelligentMatch
}
