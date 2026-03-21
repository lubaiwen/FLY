const express = require('express')
const router = express.Router()
const deviceController = require('../controllers/deviceController')

router.post('/status', deviceController.syncStatus)
router.get('/status', deviceController.getStatus)
router.post('/:deviceId/heartbeat', deviceController.heartbeat)
router.post('/:deviceId/command', deviceController.command)

module.exports = router