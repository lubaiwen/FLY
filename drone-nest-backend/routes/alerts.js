const express = require('express')
const router = express.Router()
const alertController = require('../controllers/alertController')

router.get('/stats', alertController.getAlertStats)
router.get('/', alertController.getAlerts)
router.get('/:id', alertController.getAlertById)
router.post('/', alertController.createAlert)
router.put('/:id/read', alertController.markAsRead)
router.put('/read-all', alertController.markAllAsRead)
router.put('/:id/resolve', alertController.resolveAlert)
router.delete('/:id', alertController.deleteAlert)

module.exports = router
