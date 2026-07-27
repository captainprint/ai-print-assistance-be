const User = require('../models/User');
const { signToken } = require('../middleware/auth');

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  if (!user.isActive) return res.status(403).json({ message: 'Account is inactive' });

  const match = await user.comparePassword(password);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  const token = signToken({ id: user._id, role: user.role, email: user.email });
  res.json({ token, user: user.toSafeObject() });
}

async function logout(req, res) {
  res.json({ message: 'Logged out successfully' });
}

async function me(req, res) {
  if (!req.user.id) {
    return res.json({ user: { username: 'admin', role: 'admin' } });
  }
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: user.toSafeObject() });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  if (!req.user.id) {
    return res.status(400).json({ message: 'Password change is not available for this account' });
  }

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const match = await user.comparePassword(currentPassword);
  if (!match) return res.status(401).json({ message: 'Current password is incorrect' });

  user.password = newPassword;
  await user.save();

  res.json({ message: 'Password changed successfully' });
}

module.exports = { login, logout, me, changePassword };
