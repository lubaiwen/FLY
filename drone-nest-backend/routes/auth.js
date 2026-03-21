const express = require('express')
const router = express.Router()
const { login, register, getProfile, logout, getInfo, updateInfo, changePassword } = require('../controllers/authController')

router.post('/login', login)
router.post('/register', register)
router.post('/logout', logout)
router.get('/profile', getProfile)
router.get('/info', getInfo)
router.put('/info', updateInfo)
router.put('/password', changePassword)

module.exports = router
