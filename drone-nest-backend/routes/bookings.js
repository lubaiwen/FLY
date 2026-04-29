const express = require('express')
const router = express.Router()
const bookingController = require('../controllers/bookingController')
const authMiddleware = require('../middleware/auth')

router.get('/schedule', authMiddleware, bookingController.getSchedule)
router.get('/', authMiddleware, bookingController.getList)
router.get('/:id', authMiddleware, bookingController.getById)
router.post('/create', authMiddleware, bookingController.create)
router.post('/check-availability', authMiddleware, bookingController.checkAvailability)
router.put('/:id', authMiddleware, bookingController.update)
router.post('/:id/cancel', authMiddleware, bookingController.cancel)
router.post('/:id/confirm', authMiddleware, bookingController.confirm)

module.exports = router
