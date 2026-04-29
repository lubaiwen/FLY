const express = require('express')
const router = express.Router()
const { login, register, getProfile, logout, getInfo, updateInfo, changePassword } = require('../controllers/authController')
const authMiddleware = require('../middleware/auth')

router.post('/login', login)
router.post('/register', register)
router.post('/logout', authMiddleware, logout)
router.get('/profile', authMiddleware, getProfile)
router.get('/info', authMiddleware, getInfo)
router.put('/info', authMiddleware, updateInfo)
router.put('/password', authMiddleware, changePassword)

module.exports = router
