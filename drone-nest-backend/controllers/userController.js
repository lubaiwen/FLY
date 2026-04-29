const bcrypt = require('bcryptjs')
const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')

const PUBLIC_USER_FIELDS = ['id', 'username', 'name', 'role', 'enterprise', 'phone', 'email', 'create_time']
const sanitizeUser = (user) => PUBLIC_USER_FIELDS.reduce((result, field) => {
  if (user && user[field] !== undefined) result[field] = user[field]
  return result
}, {})

exports.getList = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, role, enterprise } = req.query
    const offset = (page - 1) * pageSize

    try {
      let sql = 'SELECT id, username, name, role, enterprise, phone, email, create_time FROM users WHERE 1=1'
      const params = []

      if (role !== undefined && role !== '') {
        sql += ' AND role = ?'
        params.push(role)
      }
      if (enterprise) {
        sql += ' AND enterprise LIKE ?'
        params.push(`%${enterprise}%`)
      }

      sql += ' ORDER BY create_time DESC LIMIT ? OFFSET ?'
      params.push(parseInt(pageSize), parseInt(offset))

      const [rows] = await pool.query(sql, params)

      let countSql = 'SELECT COUNT(*) as total FROM users WHERE 1=1'
      const countParams = params.slice(0, -2)
      if (role !== undefined && role !== '') countSql += ' AND role = ?'
      if (enterprise) countSql += ' AND enterprise LIKE ?'
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
      let filtered = [...MemoryStore.users]

      if (role !== undefined && role !== '') {
        filtered = filtered.filter(u => u.role === role)
      }
      if (enterprise) {
        filtered = filtered.filter(u => u.enterprise && u.enterprise.includes(enterprise))
      }

      const total = filtered.length
      const list = filtered.slice(offset, offset + parseInt(pageSize)).map(sanitizeUser)

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
      const [rows] = await pool.query('SELECT id, username, name, role, enterprise, phone, email, create_time FROM users WHERE id = ?', [id])

      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '用户不存在', data: null })
      }

      res.json({ code: 200, message: '获取成功', data: rows[0] })
    } catch (dbError) {
      const user = MemoryStore.users.find(u => u.id === parseInt(id))

      if (!user) {
        return res.status(404).json({ code: 404, message: '用户不存在', data: null })
      }

      res.json({ code: 200, message: '获取成功', data: sanitizeUser(user) })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.create = async (req, res) => {
  try {
    const { username, password, name, role, enterprise, phone, email } = req.body

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空', data: null })
    }

    if (password.length < 6) {
      return res.status(400).json({ code: 400, message: '密码长度不能少于6位', data: null })
    }

    try {
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username])

      if (existing.length > 0) {
        return res.status(400).json({ code: 400, message: '用户名已存在', data: null })
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      const [result] = await pool.query(
        'INSERT INTO users (username, password, name, role, enterprise, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, hashedPassword, name || username, role || 'operator', enterprise, phone, email]
      )

      const [newUser] = await pool.query('SELECT id, username, name, role, enterprise, phone, email, create_time FROM users WHERE id = ?', [result.insertId])

      res.json({ code: 200, message: '创建成功', data: newUser[0] })
    } catch (dbError) {
      const exists = MemoryStore.users.find(u => u.username === username)
      if (exists) {
        return res.status(400).json({ code: 400, message: '用户名已存在', data: null })
      }

      const newUser = {
        id: MemoryStore.users.length + 1,
        username,
        password,
        name: name || username,
        role: role || 'operator',
        enterprise,
        phone,
        email,
        create_time: new Date().toISOString()
      }
      MemoryStore.users.push(newUser)

      res.json({ code: 200, message: '创建成功', data: sanitizeUser(newUser) })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.update = async (req, res) => {
  try {
    const { id } = req.params
    const { name, role, enterprise, phone, email, password } = req.body

    try {
      const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [id])

      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '用户不存在', data: null })
      }

      const fields = []
      const values = []

      if (name !== undefined) {
        fields.push('name = ?')
        values.push(name)
      }
      if (role !== undefined) {
        fields.push('role = ?')
        values.push(role)
      }
      if (enterprise !== undefined) {
        fields.push('enterprise = ?')
        values.push(enterprise)
      }
      if (phone !== undefined) {
        fields.push('phone = ?')
        values.push(phone)
      }
      if (email !== undefined) {
        fields.push('email = ?')
        values.push(email)
      }
      if (password !== undefined) {
        if (password.length < 6) {
          return res.status(400).json({ code: 400, message: '密码长度不能少于6位', data: null })
        }
        fields.push('password = ?')
        values.push(await bcrypt.hash(password, 10))
      }

      if (fields.length > 0) {
        values.push(id)
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
      }

      const [updated] = await pool.query('SELECT id, username, name, role, enterprise, phone, email, create_time FROM users WHERE id = ?', [id])
      res.json({ code: 200, message: '更新成功', data: updated[0] })
    } catch (dbError) {
      const index = MemoryStore.users.findIndex(u => u.id === parseInt(id))

      if (index === -1) {
        return res.status(404).json({ code: 404, message: '用户不存在', data: null })
      }

      if (name !== undefined) MemoryStore.users[index].name = name
      if (role !== undefined) MemoryStore.users[index].role = role
      if (enterprise !== undefined) MemoryStore.users[index].enterprise = enterprise
      if (phone !== undefined) MemoryStore.users[index].phone = phone
      if (email !== undefined) MemoryStore.users[index].email = email
      if (password !== undefined) MemoryStore.users[index].password = await bcrypt.hash(password, 10)

      res.json({ code: 200, message: '更新成功', data: sanitizeUser(MemoryStore.users[index]) })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}

exports.delete = async (req, res) => {
  try {
    const { id } = req.params

    try {
      const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [id])

      if (existing.length === 0) {
        return res.status(404).json({ code: 404, message: '用户不存在', data: null })
      }

      await pool.query('DELETE FROM users WHERE id = ?', [id])
      res.json({ code: 200, message: '删除成功', data: null })
    } catch (dbError) {
      const index = MemoryStore.users.findIndex(u => u.id === parseInt(id))

      if (index === -1) {
        return res.status(404).json({ code: 404, message: '用户不存在', data: null })
      }

      MemoryStore.users.splice(index, 1)
      res.json({ code: 200, message: '删除成功', data: null })
    }
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null })
  }
}