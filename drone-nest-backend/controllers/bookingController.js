const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')
const { v4: uuidv4 } = require('uuid')

if (!MemoryStore.bookings) {
  MemoryStore.bookings = [
    {
      id: 1,
      booking_id: 'BK001',
      drone_id: 'DR001',
      nest_id: 'NT001',
      enterprise: '顺丰速运',
      booking_type: 1,
      scheduled_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      estimated_duration: 60,
      status: 0,
      notes: '定时充电预约',
      create_time: new Date().toISOString(),
      update_time: new Date().toISOString()
    },
    {
      id: 2,
      booking_id: 'BK002',
      drone_id: 'DR002',
      nest_id: 'NT002',
      enterprise: '京东物流',
      booking_type: 2,
      scheduled_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      estimated_duration: 45,
      status: 1,
      notes: '优先充电',
      create_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      update_time: new Date().toISOString()
    },
    {
      id: 3,
      booking_id: 'BK003',
      drone_id: 'DR003',
      nest_id: 'NT003',
      enterprise: '美团配送',
      booking_type: 1,
      scheduled_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      estimated_duration: 90,
      status: 0,
      notes: '',
      create_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      update_time: new Date().toISOString()
    }
  ]
}

exports.getList = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, drone_id, nest_id, enterprise } = req.query
    const offset = (page - 1) * pageSize

    try {
      let sql = 'SELECT * FROM bookings WHERE 1=1'
      const params = []

      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }
      if (drone_id) {
        sql += ' AND drone_id LIKE ?'
        params.push(`%${drone_id}%`)
      }
      if (nest_id) {
        sql += ' AND nest_id LIKE ?'
        params.push(`%${nest_id}%`)
      }
      if (enterprise) {
        sql += ' AND enterprise LIKE ?'
        params.push(`%${enterprise}%`)
      }

      sql += ' ORDER BY scheduled_time DESC LIMIT ? OFFSET ?'
      params.push(parseInt(pageSize), parseInt(offset))

      const [rows] = await pool.query(sql, params)

      let countSql = 'SELECT COUNT(*) as total FROM bookings WHERE 1=1'
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
      let filtered = [...MemoryStore.bookings]

      if (status !== undefined && status !== '') {
        filtered = filtered.filter(b => b.status === parseInt(status))
      }
      if (drone_id) {
        filtered = filtered.filter(b => b.drone_id.includes(drone_id))
      }
      if (nest_id) {
        filtered = filtered.filter(b => b.nest_id.includes(nest_id))
      }
      if (enterprise) {
        filtered = filtered.filter(b => b.enterprise && b.enterprise.includes(enterprise))
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
      const [rows] = await pool.query('SELECT * FROM bookings WHERE booking_id = ?', [id])

      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      res.json({ code: 200, message: '获取成功', data: rows[0] })
    } catch (dbError) {
      const booking = MemoryStore.bookings.find(b => b.booking_id === id)

      if (!booking) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      res.json({ code: 200, message: '获取成功', data: booking })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.create = async (req, res) => {
  try {
    const { drone_id, nest_id, enterprise, booking_type, scheduled_time, estimated_duration, notes } = req.body

    if (!drone_id || !nest_id) {
      return res.status(400).json({ code: 400, message: '无人机ID和机巢ID不能为空', data: null })
    }

    const booking_id = 'BK' + Date.now().toString().slice(-6)

    try {
      const [result] = await pool.query(
        'INSERT INTO bookings (booking_id, drone_id, nest_id, enterprise, booking_type, scheduled_time, estimated_duration, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [booking_id, drone_id, nest_id, enterprise, booking_type || 1, scheduled_time, estimated_duration || 60, notes, 0]
      )

      const [newBooking] = await pool.query('SELECT * FROM bookings WHERE id = ?', [result.insertId])

      res.json({ code: 200, message: '创建成功', data: newBooking[0] })
    } catch (dbError) {
      const newBooking = {
        id: MemoryStore.bookings.length + 1,
        booking_id,
        drone_id,
        nest_id,
        enterprise,
        booking_type: booking_type || 1,
        scheduled_time: scheduled_time || new Date().toISOString(),
        estimated_duration: estimated_duration || 60,
        status: 0,
        notes: notes || '',
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString()
      }
      MemoryStore.bookings.push(newBooking)

      res.json({ code: 200, message: '创建成功', data: newBooking })
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
      const [existing] = await pool.query('SELECT id FROM bookings WHERE booking_id = ?', [id])

      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      const fields = []
      const values = []

      const allowedFields = ['drone_id', 'nest_id', 'enterprise', 'booking_type', 'scheduled_time', 'estimated_duration', 'notes', 'status']
      Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`)
          values.push(updateData[key])
        }
      })

      if (fields.length > 0) {
        values.push(id)
        await pool.query(`UPDATE bookings SET ${fields.join(', ')} WHERE booking_id = ?`, values)
      }

      const [updated] = await pool.query('SELECT * FROM bookings WHERE booking_id = ?', [id])
      res.json({ code: 200, message: '更新成功', data: updated[0] })
    } catch (dbError) {
      const index = MemoryStore.bookings.findIndex(b => b.booking_id === id)

      if (index === -1) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      MemoryStore.bookings[index] = {
        ...MemoryStore.bookings[index],
        ...updateData,
        update_time: new Date().toISOString()
      }

      res.json({ code: 200, message: '更新成功', data: MemoryStore.bookings[index] })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.cancel = async (req, res) => {
  try {
    const { id } = req.params

    try {
      const [existing] = await pool.query('SELECT id, status FROM bookings WHERE booking_id = ?', [id])

      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      if (existing[0].status === 2) {
        return res.status(400).json({ code: 400, message: '已完成的预约无法取消', data: null })
      }

      await pool.query('UPDATE bookings SET status = ? WHERE booking_id = ?', [3, id])

      const [updated] = await pool.query('SELECT * FROM bookings WHERE booking_id = ?', [id])
      res.json({ code: 200, message: '取消成功', data: updated[0] })
    } catch (dbError) {
      const booking = MemoryStore.bookings.find(b => b.booking_id === id)

      if (!booking) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      if (booking.status === 2) {
        return res.status(400).json({ code: 400, message: '已完成的预约无法取消', data: null })
      }

      booking.status = 3
      booking.update_time = new Date().toISOString()

      res.json({ code: 200, message: '取消成功', data: booking })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.confirm = async (req, res) => {
  try {
    const { id } = req.params

    try {
      const [existing] = await pool.query('SELECT id, status FROM bookings WHERE booking_id = ?', [id])

      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      if (existing[0].status !== 0) {
        return res.status(400).json({ code: 400, message: '只能确认待执行的预约', data: null })
      }

      await pool.query('UPDATE bookings SET status = ? WHERE booking_id = ?', [1, id])

      const [updated] = await pool.query('SELECT * FROM bookings WHERE booking_id = ?', [id])
      res.json({ code: 200, message: '确认成功', data: updated[0] })
    } catch (dbError) {
      const booking = MemoryStore.bookings.find(b => b.booking_id === id)

      if (!booking) {
        return res.status(404).json({ code: 404, message: '预约不存在', data: null })
      }

      if (booking.status !== 0) {
        return res.status(400).json({ code: 400, message: '只能确认待执行的预约', data: null })
      }

      booking.status = 1
      booking.update_time = new Date().toISOString()

      res.json({ code: 200, message: '确认成功', data: booking })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getSchedule = async (req, res) => {
  try {
    const { start_date, end_date, nest_id } = req.query

    try {
      let sql = 'SELECT * FROM bookings WHERE 1=1'
      const params = []

      if (start_date) {
        sql += ' AND scheduled_time >= ?'
        params.push(start_date)
      }
      if (end_date) {
        sql += ' AND scheduled_time <= ?'
        params.push(end_date)
      }
      if (nest_id) {
        sql += ' AND nest_id = ?'
        params.push(nest_id)
      }

      sql += ' ORDER BY scheduled_time ASC'

      const [rows] = await pool.query(sql, params)

      res.json({
        code: 200,
        message: '获取成功',
        data: rows
      })
    } catch (dbError) {
      let filtered = [...MemoryStore.bookings]

      if (start_date) {
        filtered = filtered.filter(b => new Date(b.scheduled_time) >= new Date(start_date))
      }
      if (end_date) {
        filtered = filtered.filter(b => new Date(b.scheduled_time) <= new Date(end_date))
      }
      if (nest_id) {
        filtered = filtered.filter(b => b.nest_id === nest_id)
      }

      filtered.sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time))

      res.json({
        code: 200,
        message: '获取成功',
        data: filtered
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.checkAvailability = async (req, res) => {
  try {
    const { drone_id, nest_id, scheduled_time, estimated_duration } = req.body

    if (!drone_id || !nest_id || !scheduled_time) {
      return res.status(400).json({
        code: 400,
        message: '无人机ID、机巢ID和预约时间不能为空',
        data: null
      })
    }

    const duration = estimated_duration || 60
    const startTime = new Date(scheduled_time).getTime()
    const endTime = startTime + duration * 60 * 1000

    try {
      const [existingBookings] = await pool.query(
        'SELECT * FROM bookings WHERE nest_id = ? AND status IN (0, 1) AND ((scheduled_time <= ? AND scheduled_time + INTERVAL estimated_duration MINUTE > ?) OR (scheduled_time < ? AND scheduled_time + INTERVAL estimated_duration MINUTE >= ?))',
        [nest_id, new Date(startTime), new Date(startTime), new Date(endTime), new Date(endTime)]
      )

      if (existingBookings.length > 0) {
        return res.json({
          code: 200,
          message: '该时段已被预约',
          data: {
            available: false,
            conflicting_bookings: existingBookings.length
          }
        })
      }

      res.json({
        code: 200,
        message: '可用',
        data: {
          available: true,
          conflicting_bookings: 0
        }
      })
    } catch (dbError) {
      const conflicting = MemoryStore.bookings.filter(b => {
        if (b.nest_id !== nest_id) return false
        if (![0, 1].includes(b.status)) return false

        const bStart = new Date(b.scheduled_time).getTime()
        const bEnd = bStart + b.estimated_duration * 60 * 1000

        return (bStart <= startTime && bEnd > startTime) || (bStart < endTime && bEnd >= endTime)
      })

      if (conflicting.length > 0) {
        return res.json({
          code: 200,
          message: '该时段已被预约',
          data: {
            available: false,
            conflicting_bookings: conflicting.length
          }
        })
      }

      res.json({
        code: 200,
        message: '可用',
        data: {
          available: true,
          conflicting_bookings: 0
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}