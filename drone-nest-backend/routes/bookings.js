const express = require('express')
const router = express.Router()
const bookingController = require('../controllers/bookingController')

router.get('/', bookingController.getList)
router.get('/schedule', bookingController.getSchedule)
router.get('/:id', bookingController.getById)
router.post('/create', bookingController.create)
router.post('/check-availability', bookingController.checkAvailability)
router.put('/:id', bookingController.update)
router.post('/:id/cancel', bookingController.cancel)
router.post('/:id/confirm', bookingController.confirm)

module.exports = router