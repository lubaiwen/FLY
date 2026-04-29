const express = require('express')
const router = express.Router()
const chargingController = require('../controllers/chargingController')
const authMiddleware = require('../middleware/auth')

router.get('/stats', authMiddleware, chargingController.getChargingStats)
router.get('/', authMiddleware, chargingController.getChargingRecords)
router.get('/:id', authMiddleware, chargingController.getChargingRecordById)
router.post('/', authMiddleware, chargingController.createChargingRecord)
router.put('/:id', authMiddleware, chargingController.updateChargingRecord)
router.post('/:id/stop', authMiddleware, chargingController.stopCharging)

module.exports = router
