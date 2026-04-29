const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

async function enrichNestWithStats(nest) {
  const today = new Date().toISOString().split('T')[0]
  try {
    const [todayCharges] = await pool.query(
      'SELECT COUNT(*) as count FROM charging_records WHERE nest_id = ? AND DATE(create_time) = ?',
      [nest.nest_id, today]
    )
    const [totalDuration] = await pool.query(
      'SELECT COALESCE(SUM(charge_duration), 0) as total FROM charging_records WHERE nest_id = ? AND status = 1',
      [nest.nest_id]
    )
    const [totalCharges] = await pool.query(
      'SELECT COUNT(*) as count FROM charging_records WHERE nest_id = ? AND status = 1',
      [nest.nest_id]
    )
    const [faultCount] = await pool.query(
      'SELECT COUNT(*) as count FROM alerts WHERE nest_id = ? AND level >= 3',
      [nest.nest_id]
    )
    const [onlineHours] = await pool.query(
      'SELECT COALESCE(SUM(TIMESTAMPDIFF(HOUR, online_time, COALESCE(update_time, NOW()))), 0) as hours FROM nests WHERE nest_id = ? AND status != 0',
      [nest.nest_id]
    )
    nest.today_charges = todayCharges[0].count
    nest.total_duration = Math.round(totalDuration[0].total / 60)
    nest.total_charges = totalCharges[0].count
    nest.fault_count = faultCount[0].count
    nest.utilization_rate = nest.total_charges > 0 ? Math.round((nest.total_charges / Math.max(1, onlineHours[0].hours || 1)) * 100) : 0
  } catch (e) {
    nest.today_charges = nest.today_charges || 0
    nest.total_duration = nest.total_duration || 0
    nest.total_charges = nest.total_charges || 0
    nest.fault_count = nest.fault_count || 0
    nest.utilization_rate = nest.utilization_rate || 0
  }
  return nest
}

function enrichNestWithMemoryStats(nest) {
  const today = new Date().toDateString()
  const todayCharges = MemoryStore.chargingRecords.filter(
    r => r.nest_id === nest.nest_id && new Date(r.create_time).toDateString() === today
  )
  const completedCharges = MemoryStore.chargingRecords.filter(
    r => r.nest_id === nest.nest_id && r.status === 1
  )
  const faultAlerts = MemoryStore.alerts.filter(
    a => a.nest_id === nest.nest_id && a.level >= 3
  )
  nest.today_charges = todayCharges.length
  nest.total_duration = Math.round(completedCharges.reduce((sum, r) => sum + (r.charge_duration || 0), 0) / 60)
  nest.total_charges = completedCharges.length
  nest.fault_count = faultAlerts.length
  nest.utilization_rate = completedCharges.length > 0 ? Math.round((completedCharges.length / Math.max(1, completedCharges.length)) * 100) : 0
  return nest
}

exports.getList = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status } = req.query
    const offset = (page - 1) * pageSize
    
    try {
      let sql = 'SELECT * FROM nests WHERE 1=1'
      const params = []
      
      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }
      
      sql += ' ORDER BY create_time DESC LIMIT ? OFFSET ?'
      params.push(parseInt(pageSize), parseInt(offset))
      
      const [rows] = await pool.query(sql, params)
      
      let countSql = 'SELECT COUNT(*) as total FROM nests WHERE 1=1'
      const countParams = params.slice(0, -2)
      if (status !== undefined && status !== '') countSql += ' AND status = ?'
      const [countResult] = await pool.query(countSql, countParams)

      const enrichedRows = []
      for (const row of rows) {
        enrichedRows.push(await enrichNestWithStats({ ...row }))
      }
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          list: enrichedRows,
          total: countResult[0].total,
          page: parseInt(page),
          pageSize: parseInt(pageSize)
        }
      })
    } catch (dbError) {
      let filtered = [...MemoryStore.nests]
      
      if (status !== undefined && status !== '') {
        filtered = filtered.filter(n => n.status === parseInt(status))
      }
      
      const total = filtered.length
      const list = filtered.slice(offset, offset + parseInt(pageSize)).map(n => enrichNestWithMemoryStats({ ...n }))
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { list, total, page: parseInt(page), pageSize: parseInt(pageSize) }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getById = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [rows] = await pool.query('SELECT * FROM nests WHERE nest_id = ?', [id])
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      const enriched = await enrichNestWithStats({ ...rows[0] })
      
      const [currentCharging] = await pool.query(
        'SELECT cr.*, d.drone_id, d.current_battery FROM charging_records cr JOIN drones d ON cr.drone_id = d.drone_id WHERE cr.nest_id = ? AND cr.status = 0 LIMIT 1',
        [id]
      )
      if (currentCharging.length > 0) {
        enriched.current_charging_info = {
          drone_id: currentCharging[0].drone_id,
          current_battery: currentCharging[0].current_battery,
          start_battery: currentCharging[0].start_battery || 0,
          charge_power: enriched.charge_power || 1500
        }
      }
      
      res.json({ code: 200, message: '获取成功', data: enriched })
    } catch (dbError) {
      const nest = MemoryStore.nests.find(n => n.nest_id === id)
      
      if (!nest) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      const enriched = enrichNestWithMemoryStats({ ...nest })
      
      const currentCharging = MemoryStore.chargingRecords.find(
        r => r.nest_id === id && r.status === 0
      )
      if (currentCharging) {
        const drone = MemoryStore.drones.find(d => d.drone_id === currentCharging.drone_id)
        enriched.current_charging_info = {
          drone_id: currentCharging.drone_id,
          current_battery: drone?.current_battery || 0,
          start_battery: currentCharging.start_battery || 0,
          charge_power: enriched.charge_power || 1500
        }
      }
      
      res.json({ code: 200, message: '获取成功', data: enriched })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.create = async (req, res) => {
  try {
    const { nest_id, nest_name, location, longitude, latitude, charge_power } = req.body
    
    if (!nest_id) {
      return res.status(400).json({ code: 400, message: '机巢ID不能为空', data: null })
    }
    
    try {
      const [existing] = await pool.query('SELECT id FROM nests WHERE nest_id = ?', [nest_id])
      
      if (existing.length > 0) {
        return res.status(400).json({ code: 400, message: '机巢ID已存在', data: null })
      }
      
      const [result] = await pool.query(
        'INSERT INTO nests (nest_id, nest_name, location, longitude, latitude, charge_power) VALUES (?, ?, ?, ?, ?, ?)',
        [nest_id, nest_name, location, longitude, latitude, charge_power || 1500]
      )
      
      const [newNest] = await pool.query('SELECT * FROM nests WHERE id = ?', [result.insertId])
      
      res.json({ code: 200, message: '创建成功', data: newNest[0] })
    } catch (dbError) {
      const exists = MemoryStore.nests.find(n => n.nest_id === nest_id)
      if (exists) {
        return res.status(400).json({ code: 400, message: '机巢ID已存在', data: null })
      }
      
      const newNest = {
        id: MemoryStore.nests.length + 1,
        nest_id,
        nest_name,
        location,
        longitude,
        latitude,
        charge_power: charge_power || 1500,
        max_drones: req.body.max_drones || 2,
        current_charging: 0,
        status: 1,
        online_time: null,
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString()
      }
      MemoryStore.nests.push(newNest)
      
      res.json({ code: 200, message: '创建成功', data: newNest })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.update = async (req, res) => {
  try {
    const { id } = req.params
    const updateData = req.body
    
    try {
      const [existing] = await pool.query('SELECT id FROM nests WHERE nest_id = ?', [id])
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      const fields = []
      const values = []
      
      Object.keys(updateData).forEach(key => {
        if (['nest_name', 'location', 'longitude', 'latitude', 'charge_power', 'status'].includes(key)) {
          fields.push(`${key} = ?`)
          values.push(updateData[key])
        }
      })
      
      if (fields.length > 0) {
        values.push(id)
        await pool.query(`UPDATE nests SET ${fields.join(', ')} WHERE nest_id = ?`, values)
      }
      
      const [updated] = await pool.query('SELECT * FROM nests WHERE nest_id = ?', [id])

      // 通知 WebSocket 服务刷新机巢缓存
      if (req.app.locals.wsServer) {
        req.app.locals.wsServer.reloadNests()
      }

      res.json({ code: 200, message: '更新成功', data: updated[0] })
    } catch (dbError) {
      const index = MemoryStore.nests.findIndex(n => n.nest_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      MemoryStore.nests[index] = {
        ...MemoryStore.nests[index],
        ...updateData,
        update_time: new Date().toISOString()
      }
      
      res.json({ code: 200, message: '更新成功', data: MemoryStore.nests[index] })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.delete = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [existing] = await pool.query('SELECT id FROM nests WHERE nest_id = ?', [id])
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      await pool.query('DELETE FROM nests WHERE nest_id = ?', [id])
      res.json({ code: 200, message: '删除成功', data: null })
    } catch (dbError) {
      const index = MemoryStore.nests.findIndex(n => n.nest_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      MemoryStore.nests.splice(index, 1)
      res.json({ code: 200, message: '删除成功', data: null })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getStatistics = async (req, res) => {
  try {
    try {
      const [totalResult] = await pool.query('SELECT COUNT(*) as count FROM nests')
      const [onlineResult] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status != 0')
      const [availableResult] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status = 1')
      const [occupiedResult] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status = 2')
      const [faultResult] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status = 3')
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          total: totalResult[0].count,
          online: onlineResult[0].count,
          available: availableResult[0].count,
          occupied: occupiedResult[0].count,
          fault: faultResult[0].count
        }
      })
    } catch (dbError) {
      const total = MemoryStore.nests.length
      const online = MemoryStore.nests.filter(n => n.status !== 0).length
      const available = MemoryStore.nests.filter(n => n.status === 1).length
      const occupied = MemoryStore.nests.filter(n => n.status === 2).length
      const fault = MemoryStore.nests.filter(n => n.status === 3).length
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { total, online, available, occupied, fault }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}
