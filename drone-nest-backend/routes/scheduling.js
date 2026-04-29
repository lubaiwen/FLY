const express = require('express')
const router = express.Router()
const schedulingController = require('../controllers/schedulingController')
const authMiddleware = require('../middleware/auth')
const { requireRole } = require('../middleware/auth')

router.post('/run', authMiddleware, requireRole('admin', 'operator'), schedulingController.runScheduling)
router.post('/start', authMiddleware, requireRole('admin', 'operator'), schedulingController.startScheduler)
router.post('/stop', authMiddleware, requireRole('admin', 'operator'), schedulingController.stopScheduler)
router.get('/status', authMiddleware, schedulingController.getSchedulerStatus)
router.get('/metrics', authMiddleware, schedulingController.getMetrics)
router.post('/simulation/start', authMiddleware, requireRole('admin', 'operator'), schedulingController.startSimulation)
router.post('/simulation/stop', authMiddleware, requireRole('admin', 'operator'), schedulingController.stopSimulation)
router.get('/simulation/status', authMiddleware, schedulingController.getSimulationStatus)

module.exports = router
