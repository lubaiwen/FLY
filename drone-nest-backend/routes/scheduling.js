const express = require('express')
const router = express.Router()
const schedulingController = require('../controllers/schedulingController')

router.post('/run', schedulingController.runScheduling)
router.post('/start', schedulingController.startScheduler)
router.post('/stop', schedulingController.stopScheduler)
router.get('/status', schedulingController.getSchedulerStatus)
router.get('/metrics', schedulingController.getMetrics)
router.post('/simulation/start', schedulingController.startSimulation)
router.post('/simulation/stop', schedulingController.stopSimulation)
router.get('/simulation/status', schedulingController.getSimulationStatus)

module.exports = router