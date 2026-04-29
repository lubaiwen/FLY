const express = require('express')
const router = express.Router()
const droneController = require('../controllers/droneController')
const authMiddleware = require('../middleware/auth')
const { requireRole } = require('../middleware/auth')

router.get('/statistics', authMiddleware, droneController.getStatistics)
router.get('/export', authMiddleware, droneController.exportDrones)
router.post('/bind-nest', authMiddleware, requireRole('admin', 'operator'), droneController.bindNest)
router.get('/', authMiddleware, droneController.getList)
router.get('/:id', authMiddleware, droneController.getById)
router.post('/', authMiddleware, requireRole('admin', 'operator'), droneController.create)
router.put('/:id', authMiddleware, requireRole('admin', 'operator'), droneController.update)
router.delete('/:id', authMiddleware, requireRole('admin'), droneController.delete)

module.exports = router
