const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

const POSITION_TOLERANCE = 0.005

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c * 1000
}

const getChargingRecords = async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query
    const offset = (page - 1) * pageSize
    
    try {
      let sql = 'SELECT * FROM charging_records WHERE 1=1'
      const params = []
      
      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }
      
      sql += ' ORDER BY create_time DESC LIMIT ? OFFSET ?'
      params.push(parseInt(pageSize), parseInt(offset))
      
      const [rows] = await pool.query(sql, params)
      
      let countSql = 'SELECT COUNT(*) as total FROM charging_records WHERE 1=1'
      if (status !== undefined && status !== '') {
        countSql += ' AND status = ' + parseInt(status)
      }
      const [countResult] = await pool.query(countSql)
      
      const formattedRows = rows.map(row => ({
        ...row,
        id: row.id,
        order_id: row.record_id,
        status_text: ['充电中', '已完成', '已中断'][row.status] || '未知',
        duration: row.charge_duration || 0
      }))
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { list: formattedRows, total: countResult[0].total }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      let records = [...MemoryStore.chargingRecords]
      
      if (status) {
        records = records.filter(r => r.status === parseInt(status))
      }
      
      const total = records.length
      const list = records.slice(offset, offset + parseInt(pageSize))
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { list, total }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getChargingRecordById = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [rows] = await pool.query(
        'SELECT * FROM charging_records WHERE record_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '记录不存在', data: null })
      }
      
      const row = rows[0]
      res.json({ 
        code: 200, 
        message: '获取成功', 
        data: {
          ...row,
          order_id: row.record_id,
          status_text: ['充电中', '已完成', '已中断'][row.status] || '未知'
        }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      const record = MemoryStore.chargingRecords.find(r => r.id === parseInt(id) || r.record_id === id)
      
      if (!record) {
        return res.status(404).json({ code: 404, message: '记录不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: record })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const createChargingRecord = async (req, res) => {
  try {
    const { drone_id, nest_id, charge_power } = req.body
    
    if (!drone_id || !nest_id) {
      return res.status(400).json({ code: 400, message: '缺少必要参数', data: null })
    }
    
    try {
      const [droneRows] = await pool.query('SELECT * FROM drones WHERE drone_id = ?', [drone_id])
      const [nestRows] = await pool.query('SELECT * FROM nests WHERE nest_id = ?', [nest_id])
      
      if (droneRows.length === 0) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      if (nestRows.length === 0) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      const drone = droneRows[0]
      const nest = nestRows[0]
      
      if (nest.status === 3) {
        return res.status(400).json({ code: 400, message: '机巢故障，无法充电', data: null })
      }
      
      if (nest.status === 0) {
        return res.status(400).json({ code: 400, message: '机巢离线，无法充电', data: null })
      }
      
      if (nest.current_charging >= nest.max_drones) {
        return res.status(400).json({ 
          code: 400, 
          message: `机巢充电位已满，当前${nest.current_charging}/${nest.max_drones}架正在充电`, 
          data: null 
        })
      }
      
      const droneLat = drone.latitude
      const droneLon = drone.longitude
      const nestLat = nest.latitude
      const nestLon = nest.longitude
      
      if (droneLat && droneLon && nestLat && nestLon) {
        const distance = calculateDistance(droneLat, droneLon, nestLat, nestLon)
        
        if (distance > 100) {
          return res.status(400).json({ 
            code: 400, 
            message: `无人机不在机巢位置，距离机巢${Math.round(distance)}米，请先飞往机巢`, 
            data: { distance, dronePosition: { lat: droneLat, lon: droneLon }, nestPosition: { lat: nestLat, lon: nestLon } }
          })
        }
      }
      
      const [existingCharging] = await pool.query(
        'SELECT * FROM charging_records WHERE drone_id = ? AND status = 0',
        [drone_id]
      )
      
      if (existingCharging.length > 0) {
        return res.status(400).json({ code: 400, message: '该无人机已在充电中', data: null })
      }
      
      const record_id = `CR${String(Date.now()).slice(-8)}`
      const now = new Date()
      
      await pool.query(
        `INSERT INTO charging_records 
         (record_id, drone_id, nest_id, start_battery, charge_power, start_time, status) 
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [record_id, drone_id, nest_id, drone.current_battery, charge_power || nest.charge_power, now]
      )
      
      await pool.query(
        'UPDATE drones SET status = 2, bind_nest_id = ?, longitude = ?, latitude = ?, update_time = NOW() WHERE drone_id = ?',
        [nest_id, nestLon, nestLat, drone_id]
      )
      
      await pool.query(
        'UPDATE nests SET current_charging = current_charging + 1, status = CASE WHEN current_charging + 1 >= max_drones THEN 2 ELSE status END, update_time = NOW() WHERE nest_id = ?',
        [nest_id]
      )
      
      const [newRecord] = await pool.query('SELECT * FROM charging_records WHERE record_id = ?', [record_id])
      
      res.json({ 
        code: 200, 
        message: '充电任务已创建', 
        data: {
          ...newRecord[0],
          order_id: newRecord[0].record_id,
          status_text: '充电中'
        }
      })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const drone = MemoryStore.drones.find(d => d.drone_id === drone_id)
      const nest = MemoryStore.nests.find(n => n.nest_id === nest_id)
      
      if (!drone) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      if (!nest) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      if (nest.status === 3) {
        return res.status(400).json({ code: 400, message: '机巢故障，无法充电', data: null })
      }
      
      if (nest.status === 0) {
        return res.status(400).json({ code: 400, message: '机巢离线，无法充电', data: null })
      }
      
      if (nest.current_charging >= nest.max_drones) {
        return res.status(400).json({ 
          code: 400, 
          message: `机巢充电位已满，当前${nest.current_charging}/${nest.max_drones}架正在充电`, 
          data: null 
        })
      }
      
      const droneLat = drone.latitude
      const droneLon = drone.longitude
      const nestLat = nest.latitude
      const nestLon = nest.longitude
      
      if (droneLat && droneLon && nestLat && nestLon) {
        const distance = calculateDistance(droneLat, droneLon, nestLat, nestLon)
        
        if (distance > 100) {
          return res.status(400).json({ 
            code: 400, 
            message: `无人机不在机巢位置，距离机巢${Math.round(distance)}米，请先飞往机巢`, 
            data: { distance, dronePosition: { lat: droneLat, lon: droneLon }, nestPosition: { lat: nestLat, lon: nestLon } }
          })
        }
      }
      
      const existingCharging = MemoryStore.chargingRecords.find(r => r.drone_id === drone_id && r.status === 0)
      
      if (existingCharging) {
        return res.status(400).json({ code: 400, message: '该无人机已在充电中', data: null })
      }
      
      const record_id = `CR${String(Date.now()).slice(-8)}`
      
      const newRecord = {
        id: MemoryStore.chargingRecords.length + 1,
        record_id,
        order_id: record_id,
        drone_id,
        nest_id,
        status: 0,
        status_text: '充电中',
        charge_power: charge_power || nest.charge_power,
        start_battery: drone.current_battery,
        start_time: new Date().toISOString(),
        end_time: null,
        charge_duration: 0,
        create_time: new Date().toISOString()
      }
      
      MemoryStore.chargingRecords.push(newRecord)
      
      drone.status = 2
      drone.bind_nest_id = nest_id
      drone.longitude = nestLon
      drone.latitude = nestLat
      
      nest.current_charging = (nest.current_charging || 0) + 1
      if (nest.current_charging >= nest.max_drones) {
        nest.status = 2
      }
      
      res.json({ code: 200, message: '充电任务已创建', data: newRecord })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const updateChargingRecord = async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    
    try {
      const [existing] = await pool.query(
        'SELECT id FROM charging_records WHERE record_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '记录不存在', data: null })
      }
      
      const fields = []
      const values = []
      
      if (updates.end_battery !== undefined) {
        fields.push('end_battery = ?')
        values.push(updates.end_battery)
      }
      if (updates.charge_duration !== undefined) {
        fields.push('charge_duration = ?')
        values.push(updates.charge_duration)
      }
      if (updates.status !== undefined) {
        fields.push('status = ?')
        values.push(parseInt(updates.status))
      }
      if (updates.end_time) {
        fields.push('end_time = ?')
        values.push(updates.end_time)
      }
      
      if (fields.length > 0) {
        values.push(id)
        await pool.query(
          `UPDATE charging_records SET ${fields.join(', ')} WHERE record_id = ? OR id = ?`,
          [...values, parseInt(id) || 0]
        )
      }
      
      const [updated] = await pool.query('SELECT * FROM charging_records WHERE record_id = ? OR id = ?', [id, parseInt(id) || 0])
      res.json({ 
        code: 200, 
        message: '更新成功', 
        data: {
          ...updated[0],
          order_id: updated[0].record_id,
          status_text: ['充电中', '已完成', '已中断'][updated[0].status] || '未知'
        }
      })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const index = MemoryStore.chargingRecords.findIndex(r => r.id === parseInt(id) || r.record_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '记录不存在', data: null })
      }
      
      MemoryStore.chargingRecords[index] = {
        ...MemoryStore.chargingRecords[index],
        ...updates
      }
      
      res.json({ code: 200, message: '更新成功', data: MemoryStore.chargingRecords[index] })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const stopCharging = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [rows] = await pool.query(
        'SELECT * FROM charging_records WHERE record_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '记录不存在', data: null })
      }
      
      const record = rows[0]
      
      if (record.status !== 0) {
        return res.status(400).json({ code: 400, message: '该任务不在充电中', data: null })
      }
      
      const now = new Date()
      const startTime = new Date(record.start_time)
      const duration = Math.ceil((now - startTime) / 1000 / 60)
      
      await pool.query(
        `UPDATE charging_records 
         SET status = 1, end_time = ?, end_battery = 100, charge_duration = ? 
         WHERE record_id = ? OR id = ?`,
        [now, duration, id, parseInt(id) || 0]
      )
      
      await pool.query(
        'UPDATE drones SET status = 0, current_battery = 100, update_time = NOW() WHERE drone_id = ?',
        [record.drone_id]
      )
      
      await pool.query(
        'UPDATE nests SET current_charging = GREATEST(0, current_charging - 1), status = CASE WHEN current_charging - 1 <= 0 THEN 1 ELSE status END, update_time = NOW() WHERE nest_id = ?',
        [record.nest_id]
      )
      
      const [updated] = await pool.query('SELECT * FROM charging_records WHERE record_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      res.json({ 
        code: 200, 
        message: '充电已停止', 
        data: {
          ...updated[0],
          order_id: updated[0].record_id,
          status_text: '已完成'
        }
      })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const index = MemoryStore.chargingRecords.findIndex(r => r.id === parseInt(id) || r.record_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '记录不存在', data: null })
      }
      
      const record = MemoryStore.chargingRecords[index]
      
      if (record.status !== 0) {
        return res.status(400).json({ code: 400, message: '该任务不在充电中', data: null })
      }
      
      const now = new Date()
      const startTime = new Date(record.start_time)
      const duration = Math.ceil((now - startTime) / 1000 / 60)
      
      record.status = 1
      record.status_text = '已完成'
      record.end_time = now.toISOString()
      record.charge_duration = duration
      record.end_battery = 100
      
      const drone = MemoryStore.drones.find(d => d.drone_id === record.drone_id)
      if (drone) {
        drone.current_battery = 100
        drone.status = 0
      }
      
      const nest = MemoryStore.nests.find(n => n.nest_id === record.nest_id)
      if (nest) {
        nest.current_charging = Math.max(0, (nest.current_charging || 1) - 1)
        if (nest.current_charging === 0) {
          nest.status = 1
        }
      }
      
      res.json({ code: 200, message: '充电已停止', data: record })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getChargingStats = async (req, res) => {
  try {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      const [chargingResult] = await pool.query(
        'SELECT * FROM charging_records WHERE status = 0'
      )
      const [completedResult] = await pool.query(
        'SELECT * FROM charging_records WHERE status = 1 AND DATE(end_time) = ?',
        [today]
      )
      const [interruptedResult] = await pool.query(
        'SELECT * FROM charging_records WHERE status = 2 AND DATE(end_time) = ?',
        [today]
      )
      
      const [chargingDrones] = await pool.query(
        `SELECT d.*, n.nest_id as charging_nest_id, n.nest_name, n.charge_power 
         FROM drones d 
         LEFT JOIN nests n ON d.bind_nest_id = n.nest_id 
         WHERE d.status = 2`
      )
      
      const charging = chargingResult.map(r => {
        const startBattery = r.start_battery || 0
        const currentBattery = r.end_battery || startBattery
        const remainingBattery = 100 - currentBattery
        const chargeRate = r.charge_power ? (r.charge_power / 1500) : 1
        const estimatedTime = Math.ceil(remainingBattery * 0.5 / chargeRate)
        
        return {
          ...r,
          order_id: r.record_id,
          status_text: '充电中',
          current_battery: currentBattery,
          estimated_time: estimatedTime
        }
      })
      
      chargingDrones.forEach(drone => {
        const existingRecord = charging.find(c => c.drone_id === drone.drone_id)
        if (!existingRecord) {
          const startBattery = drone.current_battery || 20
          const chargePower = drone.charge_power || 1500
          const remainingBattery = 100 - startBattery
          const estimatedTime = Math.ceil(remainingBattery * 0.5 / (chargePower / 1500))
          
          charging.push({
            order_id: `CR${drone.drone_id.replace('DR', '')}`,
            drone_id: drone.drone_id,
            nest_id: drone.charging_nest_id,
            nest_name: drone.nest_name,
            drone_type: drone.drone_type,
            start_battery: startBattery,
            current_battery: startBattery,
            charge_power: chargePower,
            status: 0,
            status_text: '充电中',
            estimated_time: estimatedTime,
            start_time: new Date().toISOString()
          })
        }
      })
      
      const completedToday = completedResult.map(r => ({
        ...r,
        order_id: r.record_id,
        status_text: '已完成'
      }))
      const interrupted = interruptedResult.map(r => ({
        ...r,
        order_id: r.record_id,
        status_text: '已中断'
      }))
      
      let totalPower = 0
      completedToday.forEach(r => {
        totalPower += (r.charge_duration || 0) * (r.charge_power || 1500) / 1000 / 60
      })
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          chargingCount: charging.length,
          waitingCount: 0,
          completedCount: completedToday.length,
          interruptedCount: interrupted.length,
          totalPower: totalPower.toFixed(1),
          chargingList: charging,
          waitingList: [],
          completedList: completedToday
        }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      const today = new Date().toDateString()
      
      const charging = MemoryStore.chargingRecords.filter(r => r.status === 0).map(r => {
        const startBattery = r.start_battery || 0
        const currentBattery = r.current_battery || r.end_battery || startBattery
        const remainingBattery = 100 - currentBattery
        const chargeRate = r.charge_power ? (r.charge_power / 1500) : 1
        const estimatedTime = Math.ceil(remainingBattery * 0.5 / chargeRate)
        
        return {
          ...r,
          order_id: r.record_id,
          status_text: '充电中',
          current_battery: currentBattery,
          estimated_time: estimatedTime
        }
      })
      const completedToday = MemoryStore.chargingRecords.filter(r => 
        r.status === 1 && new Date(r.end_time).toDateString() === today
      )
      
      const totalPower = completedToday.reduce((sum, r) => {
        return sum + (r.charge_duration * r.charge_power / 1000 / 60)
      }, 0)
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          chargingCount: charging.length,
          waitingCount: 0,
          completedCount: completedToday.length,
          totalPower: totalPower.toFixed(1),
          chargingList: charging,
          waitingList: [],
          completedList: completedToday
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

module.exports = {
  getChargingRecords,
  getChargingRecordById,
  createChargingRecord,
  updateChargingRecord,
  stopCharging,
  getChargingStats
}
