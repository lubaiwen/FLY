const express = require('express')
const router = express.Router()
const nestController = require('../controllers/nestController')

router.get('/', nestController.getList)
router.get('/statistics', nestController.getStatistics)
router.get('/:id', nestController.getById)
router.post('/', nestController.create)
router.put('/:id', nestController.update)
router.delete('/:id', nestController.delete)

module.exports = router
