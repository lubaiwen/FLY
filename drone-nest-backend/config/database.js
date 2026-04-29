require('dotenv').config()
const mysql = require('mysql2/promise')
const { requireEnv } = require('./env')

const pool = mysql.createPool({
  host: requireEnv('DB_HOST', 'localhost'),
  port: Number(requireEnv('DB_PORT', '3306')),
  user: requireEnv('DB_USER', 'root'),
  password: requireEnv('DB_PASSWORD', 'root123456'),
  database: requireEnv('DB_NAME', 'drone_nest_system'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
})

async function testConnection() {
  try {
    const connection = await pool.getConnection()
    console.log('数据库连接成功')
    connection.release()
    return true
  } catch (error) {
    console.error('数据库连接失败:', error.message)
    return false
  }
}

module.exports = { pool, testConnection }
