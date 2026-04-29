const express = require('express')
const router = express.Router()
const orderController = require('../controllers/orderController')
const authMiddleware = require('../middleware/auth')

router.get('/stats', authMiddleware, orderController.getOrderStats)
router.get('/export', authMiddleware, orderController.exportOrders)
router.get('/', authMiddleware, orderController.getOrders)
router.get('/:id', authMiddleware, orderController.getOrderById)
router.post('/', authMiddleware, orderController.createOrder)
router.put('/:id', authMiddleware, orderController.updateOrder)
router.post('/:id/cancel', authMiddleware, orderController.cancelOrder)

module.exports = router
