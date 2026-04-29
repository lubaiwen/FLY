const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

const getAlerts = async (req, res) => {
  try {
    const { type, status, page = 1, pageSize = 20 } = req.query
    const offset = (page - 1) * pageSize
    
    try {
      let sql = 'SELECT * FROM alerts WHERE 1=1'
      const params = []
      
      if (type) {
        sql += ' AND type = ?'
        params.push(type)
      }
      
      if (status === 'unread') {
        sql += ' AND is_read = 0'
      } else if (status === 'read') {
        sql += ' AND is_read = 1'
      }
      
      sql += ' ORDER BY create_time DESC LIMIT ? OFFSET ?'
      params.push(parseInt(pageSize), parseInt(offset))
      
      const [rows] = await pool.query(sql, params)
      
      let countSql = 'SELECT COUNT(*) as total FROM alerts WHERE 1=1'
      const countParams = []
      if (type) {
        countSql += ' AND type = ?'
        countParams.push(type)
      }
      if (status === 'unread') countSql += ' AND is_read = 0'
      else if (status === 'read') countSql += ' AND is_read = 1'

      const [countResult] = await pool.query(countSql, countParams)
      
      const [unreadResult] = await pool.query('SELECT COUNT(*) as count FROM alerts WHERE is_read = 0')
      
      const formattedRows = rows.map(row => ({
        ...row,
        id: row.id,
        timestamp: row.create_time,
        read: row.is_read === 1,
        level_text: ['信息', '警告', '错误', '严重'][row.level - 1] || '未知'
      }))
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { list: formattedRows, total: countResult[0].total, unreadCount: unreadResult[0].count }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      let alerts = [...MemoryStore.alerts].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )
      
      if (type) {
        alerts = alerts.filter(a => a.type === type)
      }
      
      if (status === 'unread') {
        alerts = alerts.filter(a => !a.read)
      } else if (status === 'read') {
        alerts = alerts.filter(a => a.read)
      }
      
      const total = alerts.length
      const unreadCount = MemoryStore.alerts.filter(a => !a.read).length
      const list = alerts.slice(offset, offset + parseInt(pageSize))
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { list, total, unreadCount }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getAlertById = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [rows] = await pool.query(
        'SELECT * FROM alerts WHERE alert_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      const alert = {
        ...rows[0],
        timestamp: rows[0].create_time,
        read: rows[0].is_read === 1,
        level_text: ['信息', '警告', '错误', '严重'][rows[0].level - 1] || '未知'
      }
      
      res.json({ code: 200, message: '获取成功', data: alert })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      const alert = MemoryStore.alerts.find(a => a.id === parseInt(id) || a.alert_id === id)
      
      if (!alert) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: alert })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const createAlert = async (req, res) => {
  try {
    const { type, level, title, message, source, related_id } = req.body
    
    if (!title || !message) {
      return res.status(400).json({ code: 400, message: '缺少必要参数', data: null })
    }
    
    try {
      const alert_id = `ALT${String(Date.now()).slice(-8)}`
      
      const [result] = await pool.query(
        `INSERT INTO alerts (alert_id, type, level, title, message, source, related_id, is_read) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [alert_id, type || 'info', level || 2, title, message, source || 'system', related_id || null]
      )
      
      const [newAlert] = await pool.query('SELECT * FROM alerts WHERE id = ?', [result.insertId])
      
      const alert = {
        ...newAlert[0],
        timestamp: newAlert[0].create_time,
        read: false,
        level_text: ['信息', '警告', '错误', '严重'][newAlert[0].level - 1] || '未知'
      }
      
      res.json({ code: 200, message: '告警已创建', data: alert })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const newAlert = {
        id: MemoryStore.alerts.length + 1,
        alert_id: `ALT${String(Date.now()).slice(-8)}`,
        type: type || 'info',
        level: level || 2,
        title,
        message,
        source: source || 'system',
        related_id: related_id || null,
        timestamp: new Date().toISOString(),
        read: false,
        create_time: new Date().toISOString()
      }
      
      MemoryStore.alerts.unshift(newAlert)
      
      res.json({ code: 200, message: '告警已创建', data: newAlert })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [existing] = await pool.query('SELECT id FROM alerts WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      await pool.query('UPDATE alerts SET is_read = 1 WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      const [updated] = await pool.query('SELECT * FROM alerts WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      const alert = {
        ...updated[0],
        timestamp: updated[0].create_time,
        read: true,
        level_text: ['信息', '警告', '错误', '严重'][updated[0].level - 1] || '未知'
      }
      
      res.json({ code: 200, message: '已标记为已读', data: alert })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const alert = MemoryStore.alerts.find(a => a.id === parseInt(id) || a.alert_id === id)
      
      if (!alert) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      alert.read = true
      
      res.json({ code: 200, message: '已标记为已读', data: alert })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const markAllAsRead = async (req, res) => {
  try {
    try {
      await pool.query('UPDATE alerts SET is_read = 1 WHERE is_read = 0')
      res.json({ code: 200, message: '全部已标记为已读', data: null })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      MemoryStore.alerts.forEach(a => a.read = true)
      
      res.json({ code: 200, message: '全部已标记为已读', data: null })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params
    const { resolution } = req.body
    
    try {
      const [existing] = await pool.query('SELECT * FROM alerts WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      await pool.query('UPDATE alerts SET is_read = 1 WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      const [updated] = await pool.query('SELECT * FROM alerts WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      const alert = {
        ...updated[0],
        timestamp: updated[0].create_time,
        read: true,
        resolved: true,
        resolution: resolution,
        level_text: ['信息', '警告', '错误', '严重'][updated[0].level - 1] || '未知'
      }
      
      res.json({ code: 200, message: '故障已处理', data: alert })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const alert = MemoryStore.alerts.find(a => a.id === parseInt(id) || a.alert_id === id)
      
      if (!alert) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      alert.read = true
      alert.resolved = true
      alert.resolution = resolution
      
      res.json({ code: 200, message: '故障已处理', data: alert })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const deleteAlert = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [existing] = await pool.query('SELECT id FROM alerts WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      await pool.query('DELETE FROM alerts WHERE alert_id = ? OR id = ?', [id, parseInt(id) || 0])
      
      res.json({ code: 200, message: '告警已删除', data: null })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const index = MemoryStore.alerts.findIndex(a => a.id === parseInt(id) || a.alert_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '告警不存在', data: null })
      }
      
      MemoryStore.alerts.splice(index, 1)
      
      res.json({ code: 200, message: '告警已删除', data: null })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getAlertStats = async (req, res) => {
  try {
    try {
      const [criticalResult] = await pool.query(
        'SELECT COUNT(*) as count FROM alerts WHERE level >= 3 AND is_read = 0'
      )
      const [warningResult] = await pool.query(
        'SELECT COUNT(*) as count FROM alerts WHERE level = 2 AND is_read = 0'
      )
      const [infoResult] = await pool.query(
        'SELECT COUNT(*) as count FROM alerts WHERE level = 1 AND is_read = 0'
      )
      const [unreadResult] = await pool.query(
        'SELECT COUNT(*) as count FROM alerts WHERE is_read = 0'
      )
      const [totalResult] = await pool.query(
        'SELECT COUNT(*) as count FROM alerts'
      )
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          critical: criticalResult[0].count,
          warning: warningResult[0].count,
          info: infoResult[0].count,
          unread: unreadResult[0].count,
          total: totalResult[0].count
        }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      const alerts = MemoryStore.alerts
      
      const stats = {
        critical: alerts.filter(a => a.level >= 3 && !a.read).length,
        warning: alerts.filter(a => a.level === 2 && !a.read).length,
        info: alerts.filter(a => a.level === 1 && !a.read).length,
        unread: alerts.filter(a => !a.read).length,
        total: alerts.length
      }
      
      res.json({ code: 200, message: '获取成功', data: stats })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const exportAlerts = async (req, res) => {
  try {
    const { type, status } = req.query

    try {
      let sql = 'SELECT alert_id, type, level, title, message, source, related_id, is_read, create_time FROM alerts WHERE 1=1'
      const params = []

      if (type) {
        sql += ' AND type = ?'
        params.push(type)
      }
      if (status === 'unread') sql += ' AND is_read = 0'
      else if (status === 'read') sql += ' AND is_read = 1'

      sql += ' ORDER BY create_time DESC'
      const [rows] = await pool.query(sql, params)

      const levelMap = { 1: '信息', 2: '警告', 3: '错误', 4: '严重' }
      const typeMap = { error: '故障', warning: '警告', info: '信息' }

      let csv = '\uFEFF告警ID,类型,级别,标题,内容,来源,关联ID,状态,创建时间\n'
      rows.forEach(row => {
        const msg = (row.message || '').replace(/,/g, '，').replace(/\n/g, ' ')
        csv += `${row.alert_id},${typeMap[row.type] || row.type},${levelMap[row.level] || ''},${row.title},${msg},${row.source || ''},${row.related_id || ''},${row.is_read ? '已读' : '未读'},${row.create_time}\n`
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=alerts_${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csv)
    } catch (dbError) {
      const levelMap = { 1: '信息', 2: '警告', 3: '错误', 4: '严重' }
      const typeMap = { error: '故障', warning: '警告', info: '信息' }

      let alerts = [...MemoryStore.alerts]
      if (type) alerts = alerts.filter(a => a.type === type)
      if (status === 'unread') alerts = alerts.filter(a => !a.is_read)
      else if (status === 'read') alerts = alerts.filter(a => a.is_read)

      let csv = '\uFEFF告警ID,类型,级别,标题,内容,来源,关联ID,状态,创建时间\n'
      alerts.forEach(row => {
        const msg = (row.message || '').replace(/,/g, '，').replace(/\n/g, ' ')
        csv += `${row.alert_id},${typeMap[row.type] || row.type},${levelMap[row.level] || ''},${row.title},${msg},${row.source || ''},${row.related_id || ''},${row.is_read ? '已读' : '未读'},${row.create_time}\n`
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=alerts_${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csv)
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

module.exports = {
  getAlerts,
  getAlertById,
  createAlert,
  markAsRead,
  markAllAsRead,
  resolveAlert,
  deleteAlert,
  getAlertStats,
  exportAlerts
}
