const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

if (!MemoryStore.devices) {
  MemoryStore.devices = []
}

if (!MemoryStore.deviceStatuses) {
  MemoryStore.deviceStatuses = [
    { device_id: 'NT001', device_type: 'nest', status: 1, battery_level: null, signal_strength: 95, temperature: 35, last_heartbeat: new Date().toISOString(), location: { lng: 117.2272, lat: 31.8206 } },
    { device_id: 'NT002', device_type: 'nest', status: 2, battery_level: null, signal_strength: 88, temperature: 38, last_heartbeat: new Date().toISOString(), location: { lng: 117.1689, lat: 31.8421 } },
    { device_id: 'DR001', device_type: 'drone', status: 0, battery_level: 85, signal_strength: 92, temperature: null, last_heartbeat: new Date().toISOString(), location: { lng: 117.2285, lat: 31.8198 } },
    { device_id: 'DR002', device_type: 'drone', status: 1, battery_level: 72, signal_strength: 90, temperature: null, last_heartbeat: new Date().toISOString(), location: { lng: 117.1712, lat: 31.8435 } }
  ]
}

exports.syncStatus = async (req, res) => {
  try {
    const { devices } = req.body

    if (!devices || !Array.isArray(devices)) {
      return res.status(400).json({ code: 400, message: '设备列表不能为空', data: null })
    }

    const results = []
    const now = new Date().toISOString()

    try {
      for (const device of devices) {
        const { device_id, device_type, status, battery_level, signal_strength, temperature, location } = device

        const [existing] = await pool.query('SELECT id FROM device_statuses WHERE device_id = ?', [device_id])

        if (existing.length > 0) {
          await pool.query(
            'UPDATE device_statuses SET status = ?, battery_level = ?, signal_strength = ?, temperature = ?, location = ?, last_heartbeat = ? WHERE device_id = ?',
            [status, battery_level, signal_strength, temperature, JSON.stringify(location), now, device_id]
          )
        } else {
          await pool.query(
            'INSERT INTO device_statuses (device_id, device_type, status, battery_level, signal_strength, temperature, location, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [device_id, device_type, status, battery_level, signal_strength, temperature, JSON.stringify(location), now]
          )
        }

        results.push({ device_id, synced: true, timestamp: now })
      }

      res.json({ code: 200, message: '状态同步成功', data: { results, synced_count: results.length } })
    } catch (dbError) {
      for (const device of devices) {
        const { device_id, device_type, status, battery_level, signal_strength, temperature, location } = device

        const index = MemoryStore.deviceStatuses.findIndex(d => d.device_id === device_id)

        if (index >= 0) {
          MemoryStore.deviceStatuses[index] = {
            ...MemoryStore.deviceStatuses[index],
            status,
            battery_level,
            signal_strength,
            temperature,
            location,
            last_heartbeat: now
          }
        } else {
          MemoryStore.deviceStatuses.push({
            device_id,
            device_type,
            status,
            battery_level,
            signal_strength,
            temperature,
            location,
            last_heartbeat: now
          })
        }

        results.push({ device_id, synced: true, timestamp: now })
      }

      res.json({ code: 200, message: '状态同步成功', data: { results, synced_count: results.length } })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.getStatus = async (req, res) => {
  try {
    const { device_type, status } = req.query

    try {
      let sql = 'SELECT * FROM device_statuses WHERE 1=1'
      const params = []

      if (device_type) {
        sql += ' AND device_type = ?'
        params.push(device_type)
      }
      if (status !== undefined && status !== '') {
        sql += ' AND status = ?'
        params.push(parseInt(status))
      }

      sql += ' ORDER BY last_heartbeat DESC'

      const [rows] = await pool.query(sql, params)

      const formattedRows = rows.map(row => ({
        ...row,
        location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location
      }))

      res.json({ code: 200, message: '获取成功', data: { list: formattedRows, total: rows.length } })
    } catch (dbError) {
      let filtered = [...MemoryStore.deviceStatuses]

      if (device_type) {
        filtered = filtered.filter(d => d.device_type === device_type)
      }
      if (status !== undefined && status !== '') {
        filtered = filtered.filter(d => d.status === parseInt(status))
      }

      res.json({ code: 200, message: '获取成功', data: { list: filtered, total: filtered.length } })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.heartbeat = async (req, res) => {
  try {
    const { deviceId } = req.params
    const { status, battery_level, signal_strength, temperature, location } = req.body

    const now = new Date().toISOString()

    try {
      const [existing] = await pool.query('SELECT id FROM device_statuses WHERE device_id = ?', [deviceId])

      if (existing.length > 0) {
        const fields = ['last_heartbeat = ?']
        const values = [now]

        if (status !== undefined) {
          fields.push('status = ?')
          values.push(status)
        }
        if (battery_level !== undefined) {
          fields.push('battery_level = ?')
          values.push(battery_level)
        }
        if (signal_strength !== undefined) {
          fields.push('signal_strength = ?')
          values.push(signal_strength)
        }
        if (temperature !== undefined) {
          fields.push('temperature = ?')
          values.push(temperature)
        }
        if (location !== undefined) {
          fields.push('location = ?')
          values.push(JSON.stringify(location))
        }

        values.push(deviceId)
        await pool.query(`UPDATE device_statuses SET ${fields.join(', ')} WHERE device_id = ?`, values)
      } else {
        await pool.query(
          'INSERT INTO device_statuses (device_id, status, battery_level, signal_strength, temperature, location, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [deviceId, status || 0, battery_level, signal_strength, temperature, location ? JSON.stringify(location) : null, now]
        )
      }

      res.json({
        code: 200,
        message: '心跳成功',
        data: {
          device_id: deviceId,
          last_heartbeat: now,
          server_time: now
        }
      })
    } catch (dbError) {
      const index = MemoryStore.deviceStatuses.findIndex(d => d.device_id === deviceId)

      if (index >= 0) {
        MemoryStore.deviceStatuses[index].last_heartbeat = now
        if (status !== undefined) MemoryStore.deviceStatuses[index].status = status
        if (battery_level !== undefined) MemoryStore.deviceStatuses[index].battery_level = battery_level
        if (signal_strength !== undefined) MemoryStore.deviceStatuses[index].signal_strength = signal_strength
        if (temperature !== undefined) MemoryStore.deviceStatuses[index].temperature = temperature
        if (location !== undefined) MemoryStore.deviceStatuses[index].location = location
      } else {
        MemoryStore.deviceStatuses.push({
          device_id: deviceId,
          device_type: deviceId.startsWith('NT') ? 'nest' : 'drone',
          status: status || 0,
          battery_level,
          signal_strength,
          temperature,
          location,
          last_heartbeat: now
        })
      }

      res.json({
        code: 200,
        message: '心跳成功',
        data: {
          device_id: deviceId,
          last_heartbeat: now,
          server_time: now
        }
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.command = async (req, res) => {
  try {
    const { deviceId } = req.params
    const { command_type, command_data } = req.body

    if (!command_type) {
      return res.status(400).json({ code: 400, message: '指令类型不能为空', data: null })
    }

    const command_id = 'CMD' + Date.now().toString()

    try {
      const [existing] = await pool.query('SELECT id FROM device_statuses WHERE device_id = ?', [deviceId])

      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '设备不存在', data: null })
      }

      await pool.query(
        'INSERT INTO device_commands (command_id, device_id, command_type, command_data, status, create_time) VALUES (?, ?, ?, ?, ?, ?)',
        [command_id, deviceId, command_type, JSON.stringify(command_data), 'pending', new Date().toISOString()]
      )

      res.json({
        code: 200,
        message: '指令已发送',
        data: {
          command_id,
          device_id: deviceId,
          command_type,
          status: 'pending',
          create_time: new Date().toISOString()
        }
      })
    } catch (dbError) {
      if (!MemoryStore.deviceCommands) {
        MemoryStore.deviceCommands = []
      }

      const command = {
        command_id,
        device_id: deviceId,
        command_type,
        command_data,
        status: 'pending',
        create_time: new Date().toISOString()
      }

      MemoryStore.deviceCommands.push(command)

      res.json({
        code: 200,
        message: '指令已发送',
        data: command
      })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}