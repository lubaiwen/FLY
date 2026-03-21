const MemoryStore = require('../store/memoryStore')

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
  const lon = lon1 + (lon2 - lon1) * fraction
  return { lat, lon }
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
  
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints
    const pos = interpolatePosition(start.lat, start.lng, end.lat, end.lng, fraction)
    waypoints.push({
      index: i,
      position: { ...pos, altitude },
      distance: distance * fraction,
      time: duration * fraction,
      battery_remaining: start.battery ? Math.max(0, start.battery - batteryConsumption * fraction) : null,
      timestamp: Date.now() + duration * fraction * 1000
    })
  }
  
  return {
    type: 'straight',
    waypoints,
    total_distance: distance,
    estimated_duration: duration,
    battery_consumption: batteryConsumption,
    bearing,
    efficiency_score: calculateEfficiencyScore(distance, duration, batteryConsumption)
  }
}

const generatePolylinePath = (start, end, options = {}) => {
  const { altitude = 100, speed = 10, waypoints: customWaypoints = [], wind = {} } = options
  const midLat = (start.lat + end.lat) / 2
  const midLng = (start.lng + end.lng) / 2
  
  const controlPoints = customWaypoints.length > 0 ? customWaypoints : [
    { lat: midLat + (Math.random() - 0.5) * 0.01, lng: midLng + (Math.random() - 0.5) * 0.01 }
  ]
  
  const allPoints = [start, ...controlPoints, end]
  const segments = []
  let totalDistance = 0
  
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
      
      segments.push({
        index: segments.length,
        position: { ...pos, altitude },
        distance: currentDistance,
        time: currentTime,
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
    efficiency_score: calculateEfficiencyScore(totalDistance, duration, batteryConsumption)
  }
}

const generateCurvePath = (start, end, options = {}) => {
  const { altitude = 100, speed = 10, curvature = 0.3, wind = {} } = options
  const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng)
  const bearing = calculateBearing(start.lat, start.lng, end.lat, end.lng)
  
  const midLat = (start.lat + end.lat) / 2
  const midLng = (start.lng + end.lng) / 2
  const perpLat = -(end.lng - start.lng) / distance * 1000 * curvature
  const perpLng = (end.lat - start.lat) / distance * 1000 * curvature
  
  const controlLat = midLat + perpLat
  const controlLng = midLng + perpLng
  
  const waypoints = []
  const numPoints = Math.max(20, Math.ceil(distance / 50))
  let actualDistance = 0
  let prevPos = null
  
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
    
    waypoints.push({
      index: i,
      position: { lat, lng, altitude: currentAltitude },
      distance: currentDistance,
      time: currentTime,
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
    bearing,
    curvature,
    efficiency_score: calculateEfficiencyScore(actualDistance, duration, batteryConsumption)
  }
}

const calculateEfficiencyScore = (distance, duration, batteryConsumption) => {
  const distanceScore = Math.min(100, 10000 / distance)
  const timeScore = Math.min(100, 600 / duration)
  const batteryScore = Math.min(100, 50 / batteryConsumption)
  return (distanceScore * 0.3 + timeScore * 0.3 + batteryScore * 0.4).toFixed(1)
}

const findBestNest = (dronePosition, droneBattery, nests, options = {}) => {
  const { maxDistance = 10000, minBatteryMargin = 20, preferAvailable = true } = options
  
  const scoredNests = nests.map(nest => {
    const distance = calculateDistance(
      dronePosition.lat, dronePosition.lng,
      parseFloat(nest.latitude), parseFloat(nest.longitude)
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
    
    score -= (distance / 100)
    score += (batteryAfterArrival / 2)
    
    if (nest.current_drones > 0) {
      score -= nest.current_drones * 10
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

const intelligentMatch = (drones, nests, options = {}) => {
  const { algorithm = 'greedy', objective = 'min_total_distance' } = options
  const assignments = []
  const usedNests = new Set()
  
  const sortedDrones = [...drones].sort((a, b) => {
    const batteryA = a.battery?.current || a.current_battery || 50
    const batteryB = b.battery?.current || b.current_battery || 50
    return batteryA - batteryB
  })
  
  for (const drone of sortedDrones) {
    const dronePos = drone.position || {
      lat: parseFloat(drone.latitude) || 31.780,
      lng: parseFloat(drone.longitude) || 117.260
    }
    const droneBattery = drone.battery?.current || drone.current_battery || 50
    
    const availableNests = nests.filter(n => !usedNests.has(n.nest_id))
    
    if (availableNests.length === 0) continue
    
    const bestNests = findBestNest(dronePos, droneBattery, availableNests, {
      maxDistance: options.maxDistance || 15000,
      minBatteryMargin: options.minBatteryMargin || 15
    })
    
    if (bestNests.length > 0) {
      const best = bestNests[0]
      usedNests.add(best.nest.nest_id)
      
      const path = generateStraightPath(dronePos, {
        lat: parseFloat(best.nest.latitude),
        lng: parseFloat(best.nest.longitude)
      }, { speed: options.speed || 10 })
      
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
    }
  }
  
  const totalDistance = assignments.reduce((sum, a) => sum + a.distance, 0)
  const totalBatteryConsumption = assignments.reduce((sum, a) => sum + a.estimated_battery_consumption, 0)
  
  return {
    algorithm,
    objective,
    assignments,
    summary: {
      total_assignments: assignments.length,
      total_distance: totalDistance,
      total_battery_consumption: totalBatteryConsumption,
      average_distance: assignments.length > 0 ? totalDistance / assignments.length : 0,
      efficiency_score: assignments.length > 0 ? 
        (assignments.reduce((sum, a) => sum + parseFloat(a.path.efficiency_score), 0) / assignments.length).toFixed(1) : 0
    }
  }
}

const planPath = async (req, res) => {
  try {
    const { drone_id, nest_id, path_type = 'straight', options = {}, start_position } = req.body
    
    if (!drone_id || !nest_id) {
      return res.status(400).json({
        code: 400,
        message: '缺少无人机ID或机巢ID',
        data: null
      })
    }
    
    const drone = MemoryStore.drones.find(d => d.drone_id === drone_id)
    const nest = MemoryStore.nests.find(n => n.nest_id === nest_id)
    
    if (!drone) {
      return res.status(404).json({
        code: 404,
        message: '无人机不存在',
        data: null
      })
    }
    
    if (!nest) {
      return res.status(404).json({
        code: 404,
        message: '机巢不存在',
        data: null
      })
    }
    
    const start = start_position || {
      lat: parseFloat(drone.latitude) || 31.780,
      lng: parseFloat(drone.longitude) || 117.260,
      battery: drone.current_battery || 75
    }
    
    const end = {
      lat: parseFloat(nest.latitude),
      lng: parseFloat(nest.longitude)
    }
    
    let path
    switch (path_type) {
      case 'polyline':
        path = generatePolylinePath(start, end, options)
        break
      case 'curve':
        path = generateCurvePath(start, end, options)
        break
      case 'straight':
      default:
        path = generateStraightPath(start, end, options)
    }
    
    const planId = `PLAN${Date.now()}`
    
    res.json({
      code: 200,
      message: '路径规划成功',
      data: {
        plan_id: planId,
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
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

const getMultiplePaths = async (req, res) => {
  try {
    const { assignments } = req.body
    
    if (!assignments || !Array.isArray(assignments)) {
      return res.status(400).json({
        code: 400,
        message: '缺少分配信息',
        data: null
      })
    }
    
    const paths = assignments.map(({ drone_id, nest_id, path_type = 'straight' }) => {
      const drone = MemoryStore.drones.find(d => d.drone_id === drone_id)
      const nest = MemoryStore.nests.find(n => n.nest_id === nest_id)
      
      if (!drone || !nest) return null
      
      const start = {
        lat: parseFloat(drone.latitude) || 31.780,
        lng: parseFloat(drone.longitude) || 117.260
      }
      const end = {
        lat: parseFloat(nest.latitude),
        lng: parseFloat(nest.longitude)
      }
      
      let path
      switch (path_type) {
        case 'polyline':
          path = generatePolylinePath(start, end)
          break
        case 'curve':
          path = generateCurvePath(start, end)
          break
        default:
          path = generateStraightPath(start, end)
      }
      
      return {
        drone_id,
        nest_id,
        path_type,
        ...path
      }
    }).filter(p => p !== null)
    
    res.json({
      code: 200,
      message: '批量路径规划成功',
      data: paths
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

const optimizePaths = async (req, res) => {
  try {
    const { drone_ids, nest_ids, objective = 'min_distance', options = {} } = req.body
    
    if (!drone_ids || !nest_ids) {
      return res.status(400).json({
        code: 400,
        message: '缺少无人机或机巢信息',
        data: null
      })
    }
    
    const drones = drone_ids.map(id => MemoryStore.drones.find(d => d.drone_id === id)).filter(Boolean)
    const nests = nest_ids.map(id => MemoryStore.nests.find(n => n.nest_id === id)).filter(Boolean)
    
    const result = intelligentMatch(drones, nests, { ...options, objective })
    
    res.json({
      code: 200,
      message: '路径优化成功',
      data: result
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

const intelligentMatchHandler = async (req, res) => {
  try {
    const { options = {} } = req.body
    
    const drones = MemoryStore.drones.filter(d => d.status !== 2)
    const nests = MemoryStore.nests.filter(n => n.status === 1)
    
    const result = intelligentMatch(drones, nests, options)
    
    res.json({
      code: 200,
      message: '智能匹配成功',
      data: result
    })
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

const getBestNestForDrone = async (req, res) => {
  try {
    const { drone_id } = req.params
    const { max_distance, min_battery_margin } = req.query
    
    const drone = MemoryStore.drones.find(d => d.drone_id === drone_id)
    if (!drone) {
      return res.status(404).json({
        code: 404,
        message: '无人机不存在',
        data: null
      })
    }
    
    const dronePos = {
      lat: parseFloat(drone.latitude) || 31.780,
      lng: parseFloat(drone.longitude) || 117.260
    }
    const droneBattery = drone.current_battery || 50
    
    const nests = MemoryStore.nests
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
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
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
