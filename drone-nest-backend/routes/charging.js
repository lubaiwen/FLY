const express = require('express')
const router = express.Router()
const chargingController = require('../controllers/chargingController')

router.get('/stats', chargingController.getChargingStats)
router.get('/', chargingController.getChargingRecords)
router.get('/:id', chargingController.getChargingRecordById)
router.post('/', chargingController.createChargingRecord)
router.put('/:id', chargingController.updateChargingRecord)
router.post('/:id/stop', chargingController.stopCharging)

module.exports = router
