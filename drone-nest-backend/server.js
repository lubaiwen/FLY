require('dotenv').config()
const express = require('express')
const cors = require('cors')
const http = require('http')
const { testConnection } = require('./config/database')

const authRoutes = require('./routes/auth')
const droneRoutes = require('./routes/drones')
const nestRoutes = require('./routes/nests')
const orderRoutes = require('./routes/orders')
const chargingRoutes = require('./routes/charging')
const alertRoutes = require('./routes/alerts')
const schedulingRoutes = require('./routes/scheduling')
const statisticsRoutes = require('./routes/statistics')
const pathRoutes = require('./routes/path')
const userRoutes = require('./routes/users')
const bookingRoutes = require('./routes/bookings')
const deviceRoutes = require('./routes/devices')

const { WebSocketServer } = require('./services/websocketService')

const app = express()
const server = http.createServer(app)

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/devices', deviceRoutes)
app.use('/api/drones', droneRoutes)
app.use('/api/nests', nestRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/charging', chargingRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/scheduling', schedulingRoutes)
app.use('/api/statistics', statisticsRoutes)
app.use('/api/path', pathRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({
    code: 500,
    message: err.message || '服务器内部错误',
    data: null
  })
})

const PORT = process.env.PORT || 3000

async function startServer() {
  const dbConnected = await testConnection()
  
  if (!dbConnected) {
    console.log('数据库连接失败，使用内存数据模式运行')
  }
  
  const wsServer = new WebSocketServer(server)
  await wsServer.init()
  console.log('WebSocket服务已启动: ws://localhost:' + PORT + '/ws')
  
  server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`)
    console.log(`API地址: http://localhost:${PORT}/api`)
  })
}

startServer()

module.exports = app
