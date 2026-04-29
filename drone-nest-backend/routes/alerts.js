const express = require('express')
const router = express.Router()
const alertController = require('../controllers/alertController')
const authMiddleware = require('../middleware/auth')

router.get('/stats', authMiddleware, alertController.getAlertStats)
router.get('/export', authMiddleware, alertController.exportAlerts)
router.get('/', authMiddleware, alertController.getAlerts)
router.get('/:id', authMiddleware, alertController.getAlertById)
router.post('/', authMiddleware, alertController.createAlert)
router.put('/read-all', authMiddleware, alertController.markAllAsRead)
router.put('/:id/read', authMiddleware, alertController.markAsRead)
router.put('/:id/resolve', authMiddleware, alertController.resolveAlert)
router.delete('/:id', authMiddleware, alertController.deleteAlert)

module.exports = router
