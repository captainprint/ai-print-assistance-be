const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  listUsers,
  getUser,
  createUser,
  updateUser,
  toggleStatus,
  deleteUser,
} = require('../controllers/userController');

router.use(authenticate, requireAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.patch('/:id/status', toggleStatus);
router.delete('/:id', deleteUser);

module.exports = router;
