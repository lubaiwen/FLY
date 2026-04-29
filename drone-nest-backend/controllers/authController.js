const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')
const MemoryStore = require('../store/memoryStore')
const { getJwtSecret } = require('../config/env')

const JWT_SECRET = getJwtSecret()
const PUBLIC_USER_FIELDS = ['id', 'username', 'name', 'role', 'enterprise', 'phone', 'email', 'create_time']

const sanitizeUser = (user) => PUBLIC_USER_FIELDS.reduce((result, field) => {
  if (user && user[field] !== undefined) result[field] = user[field]
  return result
}, {})

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body
    
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
        data: null
      })
    }
    
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username])
      
      if (rows.length === 0) {
        return res.status(401).json({
          code: 401,
          message: '用户名或密码错误',
          data: null
        })
      }
      
      const user = rows[0]
      const isMatch = await bcrypt.compare(password, user.password)
      
      if (!isMatch) {
        return res.status(401).json({
          code: 401,
          message: '用户名或密码错误',
          data: null
        })
      }
      
      const token = generateToken(user)
      
      res.json({
        code: 200,
        message: '登录成功',
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            enterprise: user.enterprise
          }
        }
      })
    } catch (dbError) {
      const user = MemoryStore.users.find(u => u.username === username)

      if (user && bcrypt.compareSync(password, user.password)) {
        const token = generateToken(user)
        res.json({
          code: 200,
          message: '登录成功',
          data: {
            token,
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              role: user.role,
              enterprise: user.enterprise
            }
          }
        })
      } else {
        res.status(401).json({
          code: 401,
          message: '用户名或密码错误',
          data: null
        })
      }
    }
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

exports.register = async (req, res) => {
  try {
    const { username, password, name, enterprise, phone, email } = req.body
    const role = 'operator'
    
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: '用户名和密码不能为空',
        data: null
      })
    }
    
    try {
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username])
      
      if (existing.length > 0) {
        return res.status(400).json({
          code: 400,
          message: '用户名已存在',
          data: null
        })
      }
      
      const hashedPassword = await bcrypt.hash(password, 10)
      
      const [result] = await pool.query(
        'INSERT INTO users (username, password, name, role, enterprise, phone, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, hashedPassword, name || username, role, enterprise, phone, email]
      )
      
      res.json({
        code: 200,
        message: '注册成功',
        data: {
          id: result.insertId,
          username,
          name: name || username,
          role
        }
      })
    } catch (dbError) {
      const exists = MemoryStore.users.find(u => u.username === username)
      if (exists) {
        return res.status(400).json({
          code: 400,
          message: '用户名已存在',
          data: null
        })
      }
      
      const newUser = {
        id: MemoryStore.users.length + 1,
        username,
        password: bcrypt.hashSync(password, 10),
        name: name || username,
        role,
        enterprise
      }
      MemoryStore.users.push(newUser)
      
      res.json({
        code: 200,
        message: '注册成功',
        data: sanitizeUser(newUser)
      })
    }
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

exports.logout = async (req, res) => {
  res.json({
    code: 200,
    message: '退出登录成功',
    data: null
  })
}

exports.getInfo = async (req, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null
      })
    }

    try {
      const [rows] = await pool.query('SELECT id, username, name, role, enterprise, phone, email, create_time FROM users WHERE id = ?', [userId])

      if (rows.length === 0) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }

      res.json({
        code: 200,
        message: '获取成功',
        data: rows[0]
      })
    } catch (dbError) {
      const user = MemoryStore.users.find(u => u.id === userId)
      if (user) {
        res.json({
          code: 200,
          message: '获取成功',
          data: sanitizeUser(user)
        })
      } else {
        res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }
    }
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

exports.updateInfo = async (req, res) => {
  try {
    const userId = req.user?.id
    const { name, phone, email, enterprise } = req.body

    if (!userId) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null
      })
    }

    try {
      const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [userId])

      if (existing.length === 0) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }

      const fields = []
      const values = []

      if (name !== undefined) {
        fields.push('name = ?')
        values.push(name)
      }
      if (phone !== undefined) {
        fields.push('phone = ?')
        values.push(phone)
      }
      if (email !== undefined) {
        fields.push('email = ?')
        values.push(email)
      }
      if (enterprise !== undefined) {
        fields.push('enterprise = ?')
        values.push(enterprise)
      }

      if (fields.length > 0) {
        values.push(userId)
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
      }

      const [updated] = await pool.query('SELECT id, username, name, role, enterprise, phone, email, create_time FROM users WHERE id = ?', [userId])
      res.json({
        code: 200,
        message: '更新成功',
        data: updated[0]
      })
    } catch (dbError) {
      const index = MemoryStore.users.findIndex(u => u.id === userId)

      if (index === -1) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }

      if (name !== undefined) MemoryStore.users[index].name = name
      if (phone !== undefined) MemoryStore.users[index].phone = phone
      if (email !== undefined) MemoryStore.users[index].email = email
      if (enterprise !== undefined) MemoryStore.users[index].enterprise = enterprise

      const { password, ...userInfo } = MemoryStore.users[index]
      res.json({
        code: 200,
        message: '更新成功',
        data: sanitizeUser(userInfo)
      })
    }
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user?.id
    const { oldPassword, newPassword } = req.body

    if (!userId) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null
      })
    }

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        code: 400,
        message: '旧密码和新密码不能为空',
        data: null
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        code: 400,
        message: '新密码长度不能少于6位',
        data: null
      })
    }

    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId])

      if (rows.length === 0) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }

      const user = rows[0]
      const isMatch = await bcrypt.compare(oldPassword, user.password)

      if (!isMatch) {
        return res.status(400).json({
          code: 400,
          message: '旧密码错误',
          data: null
        })
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10)
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId])

      res.json({
        code: 200,
        message: '密码修改成功',
        data: null
      })
    } catch (dbError) {
      const user = MemoryStore.users.find(u => u.id === userId)

      if (!user) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }

      if (!bcrypt.compareSync(oldPassword, user.password)) {
        return res.status(400).json({
          code: 400,
          message: '旧密码错误',
          data: null
        })
      }

      user.password = bcrypt.hashSync(newPassword, 10)
      res.json({
        code: 200,
        message: '密码修改成功',
        data: null
      })
    }
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null
      })
    }

    try {
      const [rows] = await pool.query('SELECT id, username, name, role, enterprise, phone, email, create_time FROM users WHERE id = ?', [userId])

      if (rows.length === 0) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }

      res.json({
        code: 200,
        message: '获取成功',
        data: rows[0]
      })
    } catch (dbError) {
      const user = MemoryStore.users.find(u => u.id === userId)
      if (user) {
        res.json({
          code: 200,
          message: '获取成功',
          data: sanitizeUser(user)
        })
      } else {
        res.status(404).json({
          code: 404,
          message: '用户不存在',
          data: null
        })
      }
    }
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message,
      data: null
    })
  }
}
