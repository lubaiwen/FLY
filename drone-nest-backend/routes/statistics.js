const express = require('express')
const router = express.Router()
const statisticsController = require('../controllers/statisticsController')

router.get('/overview', statisticsController.getOverview)
router.get('/trend', statisticsController.getTrend)
router.get('/distribution', statisticsController.getDistribution)
router.get('/heatmap', statisticsController.getHeatmap)
router.get('/revenue', statisticsController.getRevenue)

module.exports = router
