const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

exports.getList = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, type, enterprise } = req.query
    const offset = (page - 1) * pageSize
    
    try {
      let sql = 'SELECT * FROM drones WHERE 1=1'
      const params = []
      
      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }
      if (type !== undefined && type !== '') {
        sql += ' AND drone_type = ?'
        params.push(parseInt(type))
      }
      if (enterprise) {
        sql += ' AND belong_enterprise LIKE ?'
        params.push(`%${enterprise}%`)
      }
      
      sql += ' ORDER BY create_time DESC LIMIT ? OFFSET ?'
      params.push(parseInt(pageSize), parseInt(offset))
      
      const [rows] = await pool.query(sql, params)
      
      let countSql = 'SELECT COUNT(*) as total FROM drones WHERE 1=1'
      const countParams = params.slice(0, -2)
      if (status !== undefined && status !== '') countSql += ' AND status = ?'
      if (type !== undefined && type !== '') countSql += ' AND drone_type = ?'
      if (enterprise) countSql += ' AND belong_enterprise LIKE ?'
      const [countResult] = await pool.query(countSql, countParams)
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          list: rows,
          total: countResult[0].total,
          page: parseInt(page),
          pageSize: parseInt(pageSize)
        }
      })
    } catch (dbError) {
      let filtered = [...MemoryStore.drones]
      
      if (status !== undefined && status !== '') {
        filtered = filtered.filter(d => d.status === parseInt(status))
      }
      if (type !== undefined && type !== '') {
        filtered = filtered.filter(d => d.drone_type === parseInt(type))
      }
      if (enterprise) {
        filtered = filtered.filter(d => d.belong_enterprise.includes(enterprise))
      }
      
      const total = filtered.length
      const list = filtered.slice(offset, offset + parseInt(pageSize))
      
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
      const [rows] = await pool.query('SELECT * FROM drones WHERE drone_id = ?', [id])
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: rows[0] })
    } catch (dbError) {
      const drone = MemoryStore.drones.find(d => d.drone_id === id)
      
      if (!drone) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: drone })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.create = async (req, res) => {
  try {
    const { drone_id, drone_type, belong_enterprise, battery_capacity, bind_nest_id, longitude, latitude } = req.body
    
    if (!drone_id) {
      return res.status(400).json({ code: 400, message: '无人机ID不能为空', data: null })
    }
    
    try {
      const [existing] = await pool.query('SELECT id FROM drones WHERE drone_id = ?', [drone_id])
      
      if (existing.length > 0) {
        return res.status(400).json({ code: 400, message: '无人机ID已存在', data: null })
      }
      
      const [result] = await pool.query(
        'INSERT INTO drones (drone_id, drone_type, belong_enterprise, battery_capacity, bind_nest_id, longitude, latitude) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [drone_id, drone_type || 1, belong_enterprise, battery_capacity || 5000, bind_nest_id, longitude || null, latitude || null]
      )
      
      const [newDrone] = await pool.query('SELECT * FROM drones WHERE id = ?', [result.insertId])
      
      res.json({ code: 200, message: '创建成功', data: newDrone[0] })
    } catch (dbError) {
      const exists = MemoryStore.drones.find(d => d.drone_id === drone_id)
      if (exists) {
        return res.status(400).json({ code: 400, message: '无人机ID已存在', data: null })
      }
      
      const newDrone = {
        id: MemoryStore.drones.length + 1,
        drone_id,
        drone_type: drone_type || 1,
        belong_enterprise,
        battery_capacity: battery_capacity || 5000,
        current_battery: 100,
        status: 0,
        bind_nest_id,
        longitude: longitude || null,
        latitude: latitude || null,
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString()
      }
      MemoryStore.drones.push(newDrone)
      
      res.json({ code: 200, message: '创建成功', data: newDrone })
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
      const [existing] = await pool.query('SELECT id FROM drones WHERE drone_id = ?', [id])
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      const fields = []
      const values = []
      
      Object.keys(updateData).forEach(key => {
        if (['drone_type', 'belong_enterprise', 'battery_capacity', 'current_battery', 'status', 'bind_nest_id', 'last_location'].includes(key)) {
          fields.push(`${key} = ?`)
          values.push(updateData[key])
        }
      })
      
      if (fields.length > 0) {
        values.push(id)
        await pool.query(`UPDATE drones SET ${fields.join(', ')} WHERE drone_id = ?`, values)
      }
      
      const [updated] = await pool.query('SELECT * FROM drones WHERE drone_id = ?', [id])
      res.json({ code: 200, message: '更新成功', data: updated[0] })
    } catch (dbError) {
      const index = MemoryStore.drones.findIndex(d => d.drone_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      MemoryStore.drones[index] = {
        ...MemoryStore.drones[index],
        ...updateData,
        update_time: new Date().toISOString()
      }
      
      res.json({ code: 200, message: '更新成功', data: MemoryStore.drones[index] })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.delete = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [existing] = await pool.query('SELECT id FROM drones WHERE drone_id = ?', [id])
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      await pool.query('DELETE FROM drones WHERE drone_id = ?', [id])
      res.json({ code: 200, message: '删除成功', data: null })
    } catch (dbError) {
      const index = MemoryStore.drones.findIndex(d => d.drone_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
      
      MemoryStore.drones.splice(index, 1)
      res.json({ code: 200, message: '删除成功', data: null })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.bindNest = async (req, res) => {
  try {
    const { droneId, nestId } = req.body
    
    try {
      await pool.query('UPDATE drones SET bind_nest_id = ? WHERE drone_id = ?', [nestId, droneId])
      res.json({ code: 200, message: '绑定成功', data: { drone_id: droneId, nest_id: nestId } })
    } catch (dbError) {
      const drone = MemoryStore.drones.find(d => d.drone_id === droneId)
      if (drone) {
        drone.bind_nest_id = nestId
        res.json({ code: 200, message: '绑定成功', data: { drone_id: droneId, nest_id: nestId } })
      } else {
        res.status(404).json({ code: 404, message: '无人机不存在', data: null })
      }
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.exportDrones = async (req, res) => {
  try {
    const { status, type, enterprise } = req.query

    try {
      let sql = 'SELECT drone_id, drone_type, belong_enterprise, battery_capacity, current_battery, max_flight_time, max_speed, status, bind_nest_id, longitude, latitude, create_time FROM drones WHERE 1=1'
      const params = []

      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }
      if (type !== undefined && type !== '') {
        sql += ' AND drone_type = ?'
        params.push(parseInt(type))
      }
      if (enterprise) {
        sql += ' AND belong_enterprise LIKE ?'
        params.push(`%${enterprise}%`)
      }

      sql += ' ORDER BY create_time DESC'
      const [rows] = await pool.query(sql, params)

      const statusMap = { 0: '空闲', 1: '工作中', 2: '充电中', 3: '维护中' }
      const typeMap = { 1: '固定路线', 2: '周期性', 3: '临时性' }

      let csv = '\uFEFF无人机ID,类型,所属企业,电池容量(mAh),当前电量(%),最大飞行时间(分钟),最大速度(km/h),状态,绑定机巢,经度,纬度,创建时间\n'
      rows.forEach(row => {
        csv += `${row.drone_id},${typeMap[row.drone_type] || ''},${row.belong_enterprise || ''},${row.battery_capacity},${row.current_battery},${row.max_flight_time},${row.max_speed},${statusMap[row.status] || ''},${row.bind_nest_id || ''},${row.longitude || ''},${row.latitude || ''},${row.create_time}\n`
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=drones_${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csv)
    } catch (dbError) {
      const statusMap = { 0: '空闲', 1: '工作中', 2: '充电中', 3: '维护中' }
      const typeMap = { 1: '固定路线', 2: '周期性', 3: '临时性' }

      let drones = [...MemoryStore.drones]
      if (status !== undefined && status !== '') drones = drones.filter(d => d.status === parseInt(status))
      if (type !== undefined && type !== '') drones = drones.filter(d => d.drone_type === parseInt(type))
      if (enterprise) drones = drones.filter(d => d.belong_enterprise && d.belong_enterprise.includes(enterprise))

      let csv = '\uFEFF无人机ID,类型,所属企业,电池容量(mAh),当前电量(%),最大飞行时间(分钟),最大速度(km/h),状态,绑定机巢,经度,纬度,创建时间\n'
      drones.forEach(row => {
        csv += `${row.drone_id},${typeMap[row.drone_type] || ''},${row.belong_enterprise || ''},${row.battery_capacity},${row.current_battery},${row.max_flight_time || ''},${row.max_speed || ''},${statusMap[row.status] || ''},${row.bind_nest_id || ''},${row.longitude || ''},${row.latitude || ''},${row.create_time}\n`
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=drones_${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csv)
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getStatistics = async (req, res) => {
  try {
    try {
      const [totalResult] = await pool.query('SELECT COUNT(*) as count FROM drones')
      const [onlineResult] = await pool.query('SELECT COUNT(*) as count FROM drones WHERE status IN (0, 1, 2)')
      const [chargingResult] = await pool.query('SELECT COUNT(*) as count FROM drones WHERE status = 2')
      const [typeResult] = await pool.query('SELECT drone_type, COUNT(*) as count FROM drones GROUP BY drone_type')
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          total: totalResult[0].count,
          online: onlineResult[0].count,
          charging: chargingResult[0].count,
          byType: typeResult
        }
      })
    } catch (dbError) {
      const total = MemoryStore.drones.length
      const online = MemoryStore.drones.filter(d => [0, 1, 2].includes(d.status)).length
      const charging = MemoryStore.drones.filter(d => d.status === 2).length
      const byType = [
        { drone_type: 1, count: MemoryStore.drones.filter(d => d.drone_type === 1).length },
        { drone_type: 2, count: MemoryStore.drones.filter(d => d.drone_type === 2).length },
        { drone_type: 3, count: MemoryStore.drones.filter(d => d.drone_type === 3).length }
      ]
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { total, online, charging, byType }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}
