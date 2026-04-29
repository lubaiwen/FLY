const express = require('express')
const router = express.Router()
const deviceController = require('../controllers/deviceController')
const authMiddleware = require('../middleware/auth')

router.post('/status', authMiddleware, deviceController.syncStatus)
router.get('/status', authMiddleware, deviceController.getStatus)
router.post('/:deviceId/heartbeat', authMiddleware, deviceController.heartbeat)
router.post('/:deviceId/command', authMiddleware, deviceController.command)

module.exports = router
