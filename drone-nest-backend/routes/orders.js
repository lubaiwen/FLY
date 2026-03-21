const express = require('express')
const router = express.Router()
const orderController = require('../controllers/orderController')

router.get('/stats', orderController.getOrderStats)
router.get('/', orderController.getOrders)
router.get('/:id', orderController.getOrderById)
router.post('/', orderController.createOrder)
router.put('/:id', orderController.updateOrder)
router.post('/:id/cancel', orderController.cancelOrder)

module.exports = router
