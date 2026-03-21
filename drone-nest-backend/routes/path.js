const express = require('express')
const router = express.Router()
const pathController = require('../controllers/pathController')

router.post('/plan', pathController.planPath)
router.post('/batch', pathController.getMultiplePaths)
router.post('/optimize', pathController.optimizePaths)
router.post('/intelligent-match', pathController.intelligentMatchHandler)
router.get('/best-nest/:drone_id', pathController.getBestNestForDrone)

module.exports = router
