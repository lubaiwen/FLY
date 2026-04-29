const express = require('express')
const router = express.Router()
const statisticsController = require('../controllers/statisticsController')
const authMiddleware = require('../middleware/auth')

router.get('/overview', authMiddleware, statisticsController.getOverview)
router.get('/trend', authMiddleware, statisticsController.getTrend)
router.get('/distribution', authMiddleware, statisticsController.getDistribution)
router.get('/heatmap', authMiddleware, statisticsController.getHeatmap)
router.get('/revenue', authMiddleware, statisticsController.getRevenue)

module.exports = router
