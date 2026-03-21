const express = require('express')
const router = express.Router()
const droneController = require('../controllers/droneController')

router.get('/', droneController.getList)
router.get('/statistics', droneController.getStatistics)
router.get('/:id', droneController.getById)
router.post('/', droneController.create)
router.put('/:id', droneController.update)
router.delete('/:id', droneController.delete)
router.post('/bind-nest', droneController.bindNest)

module.exports = router
