const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

const getOrders = async (req, res) => {
  try {
    const { status, keyword, page = 1, pageSize = 20 } = req.query
    const offset = (page - 1) * pageSize
    
    try {
      let sql = 'SELECT * FROM orders WHERE 1=1'
      const params = []
      
      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }
      
      if (keyword) {
        sql += ' AND (order_id LIKE ? OR drone_id LIKE ? OR nest_id LIKE ?)'
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
      }
      
      sql += ' ORDER BY create_time DESC LIMIT ? OFFSET ?'
      params.push(parseInt(pageSize), parseInt(offset))
      
      const [rows] = await pool.query(sql, params)
      
      let countSql = 'SELECT COUNT(*) as total FROM orders WHERE 1=1'
      const countParams = []
      
      if (status !== undefined && status !== '') {
        countSql += ' AND status = ?'
        countParams.push(parseInt(status))
      }
      
      if (keyword) {
        countSql += ' AND (order_id LIKE ? OR drone_id LIKE ? OR nest_id LIKE ?)'
        countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
      }
      
      const [countResult] = await pool.query(countSql, countParams)
      
      res.json({
        code: 200,
        message: '获取成功',
        data: { list: rows, total: countResult[0].total }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      let orders = [...MemoryStore.orders]
      
      if (status !== undefined && status !== '') {
        orders = orders.filter(o => o.status === Number(status))
      }
      
      if (keyword) {
        orders = orders.filter(o => 
          o.order_id.includes(keyword) || 
          o.drone_id.includes(keyword) ||
          o.nest_id.includes(keyword)
        )
      }
      
      orders.sort((a, b) => new Date(b.create_time) - new Date(a.create_time))
      
      const total = orders.length
      const list = orders.slice(offset, offset + parseInt(pageSize))
      
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

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [rows] = await pool.query(
        'SELECT * FROM orders WHERE order_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '订单不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: rows[0] })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      const order = MemoryStore.orders.find(o => o.id === parseInt(id) || o.order_id === id)
      
      if (!order) {
        return res.status(404).json({ code: 404, message: '订单不存在', data: null })
      }
      
      res.json({ code: 200, message: '获取成功', data: order })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const createOrder = async (req, res) => {
  try {
    const { drone_id, nest_id, enterprise_id, order_type, priority } = req.body
    
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
      
      const order_id = `ORD${String(Date.now()).slice(-8)}`
      
      const [result] = await pool.query(
        `INSERT INTO orders (order_id, drone_id, nest_id, enterprise_id, order_type, priority, status) 
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [order_id, drone_id, nest_id, enterprise_id || drone.belong_enterprise, order_type || 1, priority || 1]
      )
      
      const [newOrder] = await pool.query('SELECT * FROM orders WHERE id = ?', [result.insertId])
      
      res.json({ code: 200, message: '订单已创建', data: newOrder[0] })
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
      
      const order_id = `ORD${String(Date.now()).slice(-8)}`
      
      const newOrder = {
        id: MemoryStore.orders.length + 1,
        order_id,
        drone_id,
        nest_id,
        enterprise_id: enterprise_id || drone.belong_enterprise,
        order_type: order_type || 1,
        priority: priority || 1,
        status: 0,
        start_time: null,
        end_time: null,
        charge_duration: 0,
        fee: 0,
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString()
      }
      
      MemoryStore.orders.push(newOrder)
      
      res.json({ code: 200, message: '订单已创建', data: newOrder })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const updateOrder = async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    
    try {
      const [existing] = await pool.query(
        'SELECT id FROM orders WHERE order_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '订单不存在', data: null })
      }
      
      const fields = []
      const values = []
      
      const allowedFields = ['status', 'start_time', 'end_time', 'charge_duration', 'fee', 'priority']
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          fields.push(`${field} = ?`)
          values.push(updates[field])
        }
      })
      
      if (fields.length > 0) {
        values.push(id)
        await pool.query(
          `UPDATE orders SET ${fields.join(', ')}, update_time = NOW() WHERE order_id = ? OR id = ?`,
          [...values, parseInt(id) || 0]
        )
      }
      
      const [updated] = await pool.query(
        'SELECT * FROM orders WHERE order_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      res.json({ code: 200, message: '更新成功', data: updated[0] })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const index = MemoryStore.orders.findIndex(o => o.id === parseInt(id) || o.order_id === id)
      
      if (index === -1) {
        return res.status(404).json({ code: 404, message: '订单不存在', data: null })
      }
      
      MemoryStore.orders[index] = {
        ...MemoryStore.orders[index],
        ...updates,
        update_time: new Date().toISOString()
      }
      
      res.json({ code: 200, message: '更新成功', data: MemoryStore.orders[index] })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params
    
    try {
      const [rows] = await pool.query(
        'SELECT * FROM orders WHERE order_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '订单不存在', data: null })
      }
      
      const order = rows[0]
      
      if (order.status !== 0) {
        return res.status(400).json({ code: 400, message: '该订单无法取消', data: null })
      }
      
      await pool.query(
        'UPDATE orders SET status = 3, update_time = NOW() WHERE order_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      const [updated] = await pool.query(
        'SELECT * FROM orders WHERE order_id = ? OR id = ?',
        [id, parseInt(id) || 0]
      )
      
      res.json({ code: 200, message: '订单已取消', data: updated[0] })
    } catch (dbError) {
      console.log('数据库操作失败，使用内存数据:', dbError.message)
      
      const order = MemoryStore.orders.find(o => o.id === parseInt(id) || o.order_id === id)
      
      if (!order) {
        return res.status(404).json({ code: 404, message: '订单不存在', data: null })
      }
      
      if (order.status !== 0) {
        return res.status(400).json({ code: 400, message: '该订单无法取消', data: null })
      }
      
      order.status = 3
      order.update_time = new Date().toISOString()
      
      res.json({ code: 200, message: '订单已取消', data: order })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getOrderStats = async (req, res) => {
  try {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      const [totalResult] = await pool.query('SELECT COUNT(*) as count FROM orders')
      const [pendingResult] = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = 0')
      const [chargingResult] = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = 1')
      const [completedResult] = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = 2')
      const [cancelledResult] = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = 3')
      const [todayCompletedResult] = await pool.query(
        'SELECT COUNT(*) as count FROM orders WHERE status = 2 AND DATE(end_time) = ?',
        [today]
      )
      const [todayRevenueResult] = await pool.query(
        'SELECT COALESCE(SUM(fee), 0) as total FROM orders WHERE status = 2 AND DATE(end_time) = ?',
        [today]
      )
      
      res.json({
        code: 200,
        message: '获取成功',
        data: {
          total: totalResult[0].count,
          pending: pendingResult[0].count,
          charging: chargingResult[0].count,
          completed: completedResult[0].count,
          cancelled: cancelledResult[0].count,
          todayCompleted: todayCompletedResult[0].count,
          todayRevenue: todayRevenueResult[0].total
        }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)
      
      const today = new Date().toDateString()
      
      const stats = {
        total: MemoryStore.orders.length,
        pending: MemoryStore.orders.filter(o => o.status === 0).length,
        charging: MemoryStore.orders.filter(o => o.status === 1).length,
        completed: MemoryStore.orders.filter(o => o.status === 2).length,
        cancelled: MemoryStore.orders.filter(o => o.status === 3).length,
        todayCompleted: MemoryStore.orders.filter(o => 
          o.status === 2 && new Date(o.end_time).toDateString() === today
        ).length,
        todayRevenue: MemoryStore.orders
          .filter(o => o.status === 2 && new Date(o.end_time).toDateString() === today)
          .reduce((sum, o) => sum + (o.fee || 0), 0)
      }
      
      res.json({ code: 200, message: '获取成功', data: stats })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const exportOrders = async (req, res) => {
  try {
    const { status, keyword } = req.query

    try {
      let sql = 'SELECT order_id, drone_id, nest_id, enterprise_id, order_type, status, priority, start_time, end_time, charge_duration, fee, create_time FROM orders WHERE 1=1'
      const params = []

      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }
      if (keyword) {
        sql += ' AND (order_id LIKE ? OR drone_id LIKE ? OR nest_id LIKE ?)'
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
      }

      sql += ' ORDER BY create_time DESC'
      const [rows] = await pool.query(sql, params)

      const statusMap = { 0: '待处理', 1: '充电中', 2: '已完成', 3: '已取消' }
      const typeMap = { 1: '固定路线', 2: '周期性', 3: '临时性' }

      let csv = '\uFEFF订单ID,无人机,机巢,企业,订单类型,状态,优先级,开始时间,结束时间,充电时长(分钟),费用(元),创建时间\n'
      rows.forEach(row => {
        csv += `${row.order_id},${row.drone_id},${row.nest_id},${row.enterprise_id || ''},${typeMap[row.order_type] || ''},${statusMap[row.status] || ''},${row.priority},${row.start_time || ''},${row.end_time || ''},${row.charge_duration || 0},${row.fee || 0},${row.create_time}\n`
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=orders_${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csv)
    } catch (dbError) {
      const statusMap = { 0: '待处理', 1: '充电中', 2: '已完成', 3: '已取消' }
      const typeMap = { 1: '固定路线', 2: '周期性', 3: '临时性' }

      let orders = [...MemoryStore.orders]
      if (status !== undefined && status !== '') {
        orders = orders.filter(o => o.status === Number(status))
      }
      if (keyword) {
        orders = orders.filter(o => o.order_id.includes(keyword) || o.drone_id.includes(keyword) || o.nest_id.includes(keyword))
      }

      let csv = '\uFEFF订单ID,无人机,机巢,企业,订单类型,状态,优先级,开始时间,结束时间,充电时长(分钟),费用(元),创建时间\n'
      orders.forEach(row => {
        csv += `${row.order_id},${row.drone_id},${row.nest_id},${row.enterprise || ''},${typeMap[row.order_type] || ''},${statusMap[row.status] || ''},${row.priority},${row.start_time || ''},${row.end_time || ''},${row.charge_duration || 0},${row.fee || 0},${row.create_time}\n`
      })

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=orders_${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csv)
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  cancelOrder,
  getOrderStats,
  exportOrders
}
