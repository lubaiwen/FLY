const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

function calcTrend(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0
  return parseFloat(((current - previous) / previous * 100).toFixed(1))
}

function generateSparkline(values) {
  if (!values || values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values.map((v, i) => {
    const x = Math.round((i / (values.length - 1)) * 100)
    const y = Math.round(30 - ((v - min) / range) * 25)
    return `${x},${y}`
  }).join(' ')
}

const getOverview = async (req, res) => {
  try {
    try {
      const [droneCount] = await pool.query('SELECT COUNT(*) as count FROM drones')
      const [droneOnline] = await pool.query('SELECT COUNT(*) as count FROM drones WHERE status != 0')
      const [droneCharging] = await pool.query('SELECT COUNT(*) as count FROM drones WHERE status = 2')

      const [nestCount] = await pool.query('SELECT COUNT(*) as count FROM nests')
      const [nestOnline] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status != 0')
      const [nestAvailable] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status = 1')
      const [nestOccupied] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status = 2')
      const [nestFault] = await pool.query('SELECT COUNT(*) as count FROM nests WHERE status = 3')

      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const [todayOrders] = await pool.query(
        'SELECT COUNT(*) as count FROM orders WHERE DATE(create_time) = ?',
        [today]
      )
      const [yesterdayOrders] = await pool.query(
        'SELECT COUNT(*) as count FROM orders WHERE DATE(create_time) = ?',
        [yesterday]
      )
      const [todayCharging] = await pool.query(
        'SELECT COUNT(*) as count FROM charging_records WHERE status = 1 AND DATE(end_time) = ?',
        [today]
      )
      const [yesterdayCharging] = await pool.query(
        'SELECT COUNT(*) as count FROM charging_records WHERE status = 1 AND DATE(end_time) = ?',
        [yesterday]
      )
      const [todayAlerts] = await pool.query(
        'SELECT COUNT(*) as count FROM alerts WHERE DATE(create_time) = ?',
        [today]
      )
      const [yesterdayAlerts] = await pool.query(
        'SELECT COUNT(*) as count FROM alerts WHERE DATE(create_time) = ?',
        [yesterday]
      )
      const [yesterdayNestOnline] = await pool.query(
        'SELECT COUNT(*) as count FROM nests WHERE status != 0 AND DATE(update_time) <= ?',
        [yesterday]
      )

      const sparklineDays = 7
      const nestOnlineSparkline = []
      const chargingSparkline = []
      const utilizationSparkline = []
      const alertsSparkline = []
      for (let i = sparklineDays - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
        const [nOnline] = await pool.query('SELECT COUNT(*) as c FROM nests WHERE status != 0 AND DATE(update_time) <= ?', [d])
        const [chgCount] = await pool.query('SELECT COUNT(*) as c FROM charging_records WHERE status = 1 AND DATE(end_time) = ?', [d])
        const [nOccupied] = await pool.query('SELECT COUNT(*) as c FROM nests WHERE status = 2 AND DATE(update_time) <= ?', [d])
        const [nOnlineTotal] = await pool.query('SELECT COUNT(*) as c FROM nests WHERE status != 0 AND DATE(update_time) <= ?', [d])
        const [altCount] = await pool.query('SELECT COUNT(*) as c FROM alerts WHERE DATE(create_time) = ?', [d])
        nestOnlineSparkline.push(nOnline[0].c)
        chargingSparkline.push(chgCount[0].c)
        utilizationSparkline.push(nOnlineTotal[0].c > 0 ? Math.round((nOccupied[0].c / nOnlineTotal[0].c) * 100) : 0)
        alertsSparkline.push(altCount[0].c)
      }

      const totalDrones = droneCount[0].count
      const onlineDrones = droneOnline[0].count
      const chargingDrones = droneCharging[0].count
      const totalNests = nestCount[0].count
      const onlineNests = nestOnline[0].count
      const availableNests = nestAvailable[0].count
      const occupiedNests = nestOccupied[0].count
      const faultNests = nestFault[0].count
      const utilizationRate = onlineNests > 0 ? Math.round((occupiedNests / onlineNests) * 100) : 0
      const yesterdayUtilization = yesterdayNestOnline[0].count > 0 ? Math.round((occupiedNests / yesterdayNestOnline[0].count) * 100) : 0

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          totalDrones,
          onlineDrones,
          chargingDrones,
          totalNests,
          onlineNests,
          availableNests,
          occupiedNests,
          faultNests,
          utilizationRate,
          onlineRate: totalNests > 0 ? Math.round((onlineNests / totalNests) * 100) : 0,
          todayOrders: todayOrders[0].count,
          todayCharging: todayCharging[0].count,
          todayAlerts: todayAlerts[0].count,
          trends: {
            onlineNests: { trend: calcTrend(onlineNests, yesterdayNestOnline[0].count), sparkline: generateSparkline(nestOnlineSparkline) },
            charging: { trend: calcTrend(todayCharging[0].count, yesterdayCharging[0].count), sparkline: generateSparkline(chargingSparkline) },
            utilization: { trend: calcTrend(utilizationRate, yesterdayUtilization), sparkline: generateSparkline(utilizationSparkline) },
            alerts: { trend: calcTrend(todayAlerts[0].count, yesterdayAlerts[0].count), sparkline: generateSparkline(alertsSparkline) }
          }
        }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)

      const totalDrones = MemoryStore.drones.length
      const onlineDrones = MemoryStore.drones.filter(d => d.status !== 0).length
      const chargingDrones = MemoryStore.drones.filter(d => d.status === 2).length
      const totalNests = MemoryStore.nests.length
      const onlineNests = MemoryStore.nests.filter(n => n.status !== 0).length
      const availableNests = MemoryStore.nests.filter(n => n.status === 1).length
      const occupiedNests = MemoryStore.nests.filter(n => n.status === 2).length
      const faultNests = MemoryStore.nests.filter(n => n.status === 3).length

      const today = new Date().toDateString()
      const todayOrders = MemoryStore.orders.filter(o =>
        new Date(o.create_time).toDateString() === today
      )
      const todayCharging = MemoryStore.chargingRecords.filter(r =>
        r.status === 1 && new Date(r.end_time).toDateString() === today
      )
      const todayAlerts = MemoryStore.alerts.filter(a =>
        new Date(a.timestamp).toDateString() === today
      )

      const todayRevenue = MemoryStore.orders
        .filter(o => o.status === 2 && new Date(o.end_time).toDateString() === today)
        .reduce((sum, o) => sum + (o.fee || 0), 0)

      const utilizationRate = onlineNests > 0 ? Math.round((occupiedNests / onlineNests) * 100) : 0

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          totalDrones,
          onlineDrones,
          chargingDrones,
          totalNests,
          onlineNests,
          availableNests,
          occupiedNests,
          faultNests,
          utilizationRate,
          onlineRate: totalNests > 0 ? Math.round((onlineNests / totalNests) * 100) : 0,
          todayOrders: todayOrders.length,
          todayCharging: todayCharging.length,
          todayAlerts: todayAlerts.length,
          todayRevenue,
          trends: {
            onlineNests: { trend: 0, sparkline: '' },
            charging: { trend: 0, sparkline: '' },
            utilization: { trend: 0, sparkline: '' },
            alerts: { trend: 0, sparkline: '' }
          }
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getTrend = async (req, res) => {
  try {
    const { range = 'day' } = req.query
    const data = []
    const now = new Date()

    try {
      if (range === 'day') {
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now)
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().split('T')[0]

          const [orderResult] = await pool.query(
            'SELECT COUNT(*) as count FROM orders WHERE DATE(create_time) = ?',
            [dateStr]
          )
          const [chargingResult] = await pool.query(
            'SELECT COUNT(*) as count FROM charging_records WHERE DATE(create_time) = ?',
            [dateStr]
          )
          const [occupiedResult] = await pool.query(
            'SELECT COUNT(*) as count FROM nests WHERE status = 2 AND DATE(update_time) <= ?',
            [dateStr]
          )
          const [onlineResult] = await pool.query(
            'SELECT COUNT(*) as count FROM nests WHERE status != 0 AND DATE(update_time) <= ?',
            [dateStr]
          )
          const utilization = onlineResult[0].count > 0
            ? Math.round((occupiedResult[0].count / onlineResult[0].count) * 100)
            : 0

          data.push({
            date: dateStr,
            label: date.toLocaleDateString('zh-CN', { weekday: 'short' }),
            orders: orderResult[0].count,
            charging: chargingResult[0].count,
            utilization
          })
        }
      } else if (range === 'week') {
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(now)
          weekStart.setDate(weekStart.getDate() - (i * 7 + now.getDay()))
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)

          const [orderResult] = await pool.query(
            'SELECT COUNT(*) as count FROM orders WHERE DATE(create_time) BETWEEN ? AND ?',
            [weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]]
          )
          const [chargingResult] = await pool.query(
            'SELECT COUNT(*) as count FROM charging_records WHERE DATE(create_time) BETWEEN ? AND ?',
            [weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]]
          )
          const [occupiedResult] = await pool.query(
            'SELECT COUNT(*) as count FROM nests WHERE status = 2 AND DATE(update_time) <= ?',
            [weekEnd.toISOString().split('T')[0]]
          )
          const [onlineResult] = await pool.query(
            'SELECT COUNT(*) as count FROM nests WHERE status != 0 AND DATE(update_time) <= ?',
            [weekEnd.toISOString().split('T')[0]]
          )
          const utilization = onlineResult[0].count > 0
            ? Math.round((occupiedResult[0].count / onlineResult[0].count) * 100)
            : 0

          data.push({
            date: weekStart.toISOString().split('T')[0],
            label: `第${4 - i}周`,
            orders: orderResult[0].count,
            charging: chargingResult[0].count,
            utilization
          })
        }
      } else if (range === 'month') {
        for (let i = 5; i >= 0; i--) {
          const month = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)

          const [orderResult] = await pool.query(
            'SELECT COUNT(*) as count FROM orders WHERE DATE(create_time) BETWEEN ? AND ?',
            [month.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]
          )
          const [chargingResult] = await pool.query(
            'SELECT COUNT(*) as count FROM charging_records WHERE DATE(create_time) BETWEEN ? AND ?',
            [month.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]
          )
          const [occupiedResult] = await pool.query(
            'SELECT COUNT(*) as count FROM nests WHERE status = 2 AND DATE(update_time) <= ?',
            [monthEnd.toISOString().split('T')[0]]
          )
          const [onlineResult] = await pool.query(
            'SELECT COUNT(*) as count FROM nests WHERE status != 0 AND DATE(update_time) <= ?',
            [monthEnd.toISOString().split('T')[0]]
          )
          const utilization = onlineResult[0].count > 0
            ? Math.round((occupiedResult[0].count / onlineResult[0].count) * 100)
            : 0

          data.push({
            date: month.toISOString().split('T')[0],
            label: month.toLocaleDateString('zh-CN', { month: 'short' }),
            orders: orderResult[0].count,
            charging: chargingResult[0].count,
            utilization
          })
        }
      }

      res.json({ code: 200, message: '获取成功', data })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)

      if (range === 'day') {
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now)
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().split('T')[0]
          const dayOrders = MemoryStore.orders.filter(o => new Date(o.create_time).toDateString() === date.toDateString())
          const dayCharging = MemoryStore.chargingRecords.filter(r => new Date(r.create_time).toDateString() === date.toDateString())
          const onlineNests = MemoryStore.nests.filter(n => n.status !== 0).length
          const occupiedNests = MemoryStore.nests.filter(n => n.status === 2).length

          data.push({
            date: dateStr,
            label: date.toLocaleDateString('zh-CN', { weekday: 'short' }),
            orders: dayOrders.length,
            charging: dayCharging.length,
            utilization: onlineNests > 0 ? Math.round((occupiedNests / onlineNests) * 100) : 0
          })
        }
      } else if (range === 'week') {
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(now)
          weekStart.setDate(weekStart.getDate() - (i * 7 + now.getDay()))
          const onlineNests = MemoryStore.nests.filter(n => n.status !== 0).length
          const occupiedNests = MemoryStore.nests.filter(n => n.status === 2).length

          data.push({
            date: weekStart.toISOString().split('T')[0],
            label: `第${4 - i}周`,
            orders: MemoryStore.orders.length,
            charging: MemoryStore.chargingRecords.length,
            utilization: onlineNests > 0 ? Math.round((occupiedNests / onlineNests) * 100) : 0
          })
        }
      } else if (range === 'month') {
        for (let i = 5; i >= 0; i--) {
          const month = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const onlineNests = MemoryStore.nests.filter(n => n.status !== 0).length
          const occupiedNests = MemoryStore.nests.filter(n => n.status === 2).length

          data.push({
            date: month.toISOString().split('T')[0],
            label: month.toLocaleDateString('zh-CN', { month: 'short' }),
            orders: MemoryStore.orders.length,
            charging: MemoryStore.chargingRecords.length,
            utilization: onlineNests > 0 ? Math.round((occupiedNests / onlineNests) * 100) : 0
          })
        }
      }

      res.json({ code: 200, message: '获取成功', data })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getDistribution = async (req, res) => {
  try {
    try {
      const [droneTypes] = await pool.query(
        'SELECT drone_type, COUNT(*) as count FROM drones GROUP BY drone_type'
      )

      const droneTypeData = [
        { name: '固定路线', value: droneTypes.find(d => d.drone_type === 1)?.count || 0 },
        { name: '周期性', value: droneTypes.find(d => d.drone_type === 2)?.count || 0 },
        { name: '临时性', value: droneTypes.find(d => d.drone_type === 3)?.count || 0 }
      ]

      const [enterprises] = await pool.query(
        'SELECT belong_enterprise as name, COUNT(*) as value FROM drones WHERE belong_enterprise IS NOT NULL GROUP BY belong_enterprise'
      )

      const [orderStatus] = await pool.query(
        'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
      )

      const orderStatusData = [
        { name: '待处理', value: orderStatus.find(o => o.status === 0)?.count || 0 },
        { name: '进行中', value: orderStatus.find(o => o.status === 1)?.count || 0 },
        { name: '已完成', value: orderStatus.find(o => o.status === 2)?.count || 0 },
        { name: '已取消', value: orderStatus.find(o => o.status === 3)?.count || 0 }
      ]

      const [nestStatus] = await pool.query(
        'SELECT status, COUNT(*) as count FROM nests GROUP BY status'
      )

      const nestStatusData = [
        { name: '空闲', value: nestStatus.find(n => n.status === 1)?.count || 0 },
        { name: '占用', value: nestStatus.find(n => n.status === 2)?.count || 0 },
        { name: '离线', value: nestStatus.find(n => n.status === 0)?.count || 0 },
        { name: '故障', value: nestStatus.find(n => n.status === 3)?.count || 0 }
      ]

      const [chargingStatus] = await pool.query(
        'SELECT status, COUNT(*) as count FROM charging_records GROUP BY status'
      )

      const chargingStatusData = [
        { name: '充电中', value: chargingStatus.find(c => c.status === 0)?.count || 0 },
        { name: '已完成', value: chargingStatus.find(c => c.status === 1)?.count || 0 },
        { name: '已中断', value: chargingStatus.find(c => c.status === 2)?.count || 0 }
      ]

      const [alerts] = await pool.query(
        'SELECT type, level, COUNT(*) as count FROM alerts GROUP BY type, level'
      )

      const alertTypeData = [
        { name: '严重', value: alerts.filter(a => a.level >= 3).reduce((sum, a) => sum + a.count, 0) },
        { name: '警告', value: alerts.filter(a => a.level === 2).reduce((sum, a) => sum + a.count, 0) },
        { name: '信息', value: alerts.filter(a => a.level === 1).reduce((sum, a) => sum + a.count, 0) }
      ]

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          droneTypes: droneTypeData,
          byEnterprise: enterprises,
          orderStatus: orderStatusData,
          nestStatus: nestStatusData,
          chargingStatus: chargingStatusData,
          alertTypes: alertTypeData
        }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)

      const droneTypes = [
        { name: '固定路线', value: MemoryStore.drones.filter(d => d.drone_type === 1).length },
        { name: '周期性', value: MemoryStore.drones.filter(d => d.drone_type === 2).length },
        { name: '临时性', value: MemoryStore.drones.filter(d => d.drone_type === 3).length }
      ]

      const enterprises = [...new Set(MemoryStore.drones.map(d => d.belong_enterprise).filter(Boolean))]
      const byEnterprise = enterprises.map(e => ({
        name: e,
        value: MemoryStore.drones.filter(d => d.belong_enterprise === e).length
      })).filter(e => e.value > 0)

      const orderStatus = [
        { name: '待处理', value: MemoryStore.orders.filter(o => o.status === 0).length },
        { name: '进行中', value: MemoryStore.orders.filter(o => o.status === 1).length },
        { name: '已完成', value: MemoryStore.orders.filter(o => o.status === 2).length },
        { name: '已取消', value: MemoryStore.orders.filter(o => o.status === 3).length }
      ]

      const nestStatus = [
        { name: '空闲', value: MemoryStore.nests.filter(n => n.status === 1).length },
        { name: '占用', value: MemoryStore.nests.filter(n => n.status === 2).length },
        { name: '离线', value: MemoryStore.nests.filter(n => n.status === 0).length },
        { name: '故障', value: MemoryStore.nests.filter(n => n.status === 3).length }
      ]

      const chargingStatus = [
        { name: '充电中', value: MemoryStore.chargingRecords.filter(r => r.status === 0).length },
        { name: '已完成', value: MemoryStore.chargingRecords.filter(r => r.status === 1).length },
        { name: '已中断', value: MemoryStore.chargingRecords.filter(r => r.status === 2).length }
      ]

      const alertTypes = [
        { name: '严重', value: MemoryStore.alerts.filter(a => a.level >= 3).length },
        { name: '警告', value: MemoryStore.alerts.filter(a => a.level === 2).length },
        { name: '信息', value: MemoryStore.alerts.filter(a => a.level === 1).length }
      ]

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          droneTypes,
          byEnterprise,
          orderStatus,
          nestStatus,
          chargingStatus,
          alertTypes
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getHeatmap = async (req, res) => {
  try {
    try {
      const [nests] = await pool.query('SELECT nest_id FROM nests LIMIT 7')
      const nestIds = nests.map(n => n.nest_id)

      if (nestIds.length === 0) {
        return res.json({
          code: 200,
          message: '获取成功',
          data: { nests: [], days: [], data: [] }
        })
      }

      const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      const data = []

      for (let ni = 0; ni < nestIds.length; ni++) {
        for (let di = 0; di < days.length; di++) {
          const [countResult] = await pool.query(
            `SELECT COUNT(*) as count FROM charging_records 
             WHERE nest_id = ? AND DAYOFWEEK(create_time) = ? 
             AND create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
            [nestIds[ni], di + 2 > 7 ? 1 : di + 2]
          )
          data.push([ni, di, countResult[0].count])
        }
      }

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          nests: nestIds,
          days,
          data
        }
      })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)

      const nests = MemoryStore.nests.slice(0, 7).map(n => n.nest_id)
      const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

      const data = []
      nests.forEach((nestId, ni) => {
        days.forEach((day, di) => {
          const count = MemoryStore.chargingRecords.filter(r => r.nest_id === nestId).length
          data.push([ni, di, count])
        })
      })

      res.json({
        code: 200,
        message: '获取成功',
        data: {
          nests,
          days,
          data
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

const getRevenue = async (req, res) => {
  try {
    const { months = 6 } = req.query
    const data = []
    const now = new Date()

    try {
      for (let i = months - 1; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
        const monthStr = monthStart.toLocaleDateString('zh-CN', { month: 'short' })

        const [orderResult] = await pool.query(
          'SELECT COUNT(*) as orders FROM orders WHERE status = 2 AND DATE(end_time) BETWEEN ? AND ?',
          [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]
        )

        const [chargingResult] = await pool.query(
          'SELECT COUNT(*) as charging FROM charging_records WHERE status = 1 AND DATE(end_time) BETWEEN ? AND ?',
          [monthStart.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0]]
        )

        data.push({
          month: monthStr,
          orders: orderResult[0].orders || 0,
          charging: chargingResult[0].charging || 0
        })
      }

      res.json({ code: 200, message: '获取成功', data })
    } catch (dbError) {
      console.log('数据库查询失败，使用内存数据:', dbError.message)

      for (let i = months - 1; i >= 0; i--) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthStr = month.toLocaleDateString('zh-CN', { month: 'short' })
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)

        const completedOrders = MemoryStore.orders.filter(o =>
          o.status === 2 && new Date(o.end_time) >= month && new Date(o.end_time) <= monthEnd
        )
        const completedCharging = MemoryStore.chargingRecords.filter(r =>
          r.status === 1 && new Date(r.end_time) >= month && new Date(r.end_time) <= monthEnd
        )

        data.push({
          month: monthStr,
          orders: completedOrders.length,
          charging: completedCharging.length
        })
      }

      res.json({ code: 200, message: '获取成功', data })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

module.exports = {
  getOverview,
  getTrend,
  getDistribution,
  getHeatmap,
  getRevenue
}
