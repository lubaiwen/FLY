const express = require('express')
const router = express.Router()
const pathController = require('../controllers/pathController')
const authMiddleware = require('../middleware/auth')
const { requireRole } = require('../middleware/auth')

router.post('/plan', authMiddleware, requireRole('admin', 'operator'), pathController.planPath)
router.post('/batch', authMiddleware, requireRole('admin', 'operator'), pathController.getMultiplePaths)
router.post('/optimize', authMiddleware, requireRole('admin', 'operator'), pathController.optimizePaths)
router.post('/intelligent-match', authMiddleware, requireRole('admin', 'operator'), pathController.intelligentMatchHandler)
router.get('/best-nest/:drone_id', authMiddleware, pathController.getBestNestForDrone)

module.exports = router
