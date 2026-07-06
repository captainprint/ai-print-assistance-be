const User = require('../models/User');

const VALID_ROLES = ['user', 'admin'];

async function listUsers(req, res) {
  const { page = 1, limit = 10, search = '' } = req.query;
  const query = search
    ? { $or: [{ fullName: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }] }
    : {};

  const [users, total] = await Promise.all([
    User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    User.countDocuments(query),
  ]);

  res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
}

async function getUser(req, res) {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
}

async function createUser(req, res) {
  const { fullName, email, phone, role, password } = req.body;
  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ message: 'fullName, email, phone, and password are required' });
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: 'Email already in use' });

  const user = await User.create({ fullName, email, phone, role, password });
  res.status(201).json({ user: user.toSafeObject() });
}

async function updateUser(req, res) {
  const { fullName, email, phone, role, password } = req.body;
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (fullName !== undefined) user.fullName = fullName;
  if (email !== undefined) user.email = email;
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) user.role = role;
  if (password) user.password = password;

  await user.save();
  res.json({ user: user.toSafeObject() });
}

async function toggleStatus(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.isActive = !user.isActive;
  await user.save();
  res.json({ user: user.toSafeObject() });
}

async function deleteUser(req, res) {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted successfully' });
}

module.exports = { listUsers, getUser, createUser, updateUser, toggleStatus, deleteUser };
