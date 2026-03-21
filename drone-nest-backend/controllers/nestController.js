const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

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
      let filtered = [...MemoryStore.nests]
      
      if (status !== undefined && status !== '') {
        filtered = filtered.filter(n => n.status === parseInt(status))
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
      const [rows] = await pool.query('SELECT * FROM nests WHERE nest_id = ?', [id])
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: rows[0] })
    } catch (dbError) {
      const nest = MemoryStore.nests.find(n => n.nest_id === id)
      
      if (!nest) {
        return res.status(404).json({ code: 404, message: '机巢不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: nest })
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
        status: 0,
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
