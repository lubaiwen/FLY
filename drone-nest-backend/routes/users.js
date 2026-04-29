const express = require('express')
const router = express.Router()
const userController = require('../controllers/userController')
const authMiddleware = require('../middleware/auth')
const { requireRole, requireSelfOrRole } = require('../middleware/auth')

router.get('/', authMiddleware, requireRole('admin'), userController.getList)
router.get('/:id', authMiddleware, requireSelfOrRole('id', 'admin'), userController.getById)
router.post('/', authMiddleware, requireRole('admin'), userController.create)
router.put('/:id', authMiddleware, requireSelfOrRole('id', 'admin'), userController.update)
router.delete('/:id', authMiddleware, requireRole('admin'), userController.delete)

module.exports = router