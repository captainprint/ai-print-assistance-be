const router = require('express').Router();
const { getImages } = require('../controllers/imageController');

router.get('/', getImages);

module.exports = router;
