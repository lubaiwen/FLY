const express = require('express')
const router = express.Router()
const nestController = require('../controllers/nestController')
const authMiddleware = require('../middleware/auth')
const { requireRole } = require('../middleware/auth')

router.get('/statistics', authMiddleware, nestController.getStatistics)
router.get('/', authMiddleware, nestController.getList)
router.get('/:id', authMiddleware, nestController.getById)
router.post('/', authMiddleware, requireRole('admin', 'operator'), nestController.create)
router.put('/:id', authMiddleware, requireRole('admin', 'operator'), nestController.update)
router.delete('/:id', authMiddleware, requireRole('admin'), nestController.delete)

module.exports = router
