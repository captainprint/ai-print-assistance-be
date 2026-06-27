const User = require('../models/User');

async function getDashboard(req, res) {
  if (req.user.role === 'admin') {
    const [total, active, inactive] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
    ]);
    return res.json({ role: 'admin', stats: { totalUsers: total, activeUsers: active, inactiveUsers: inactive } });
  }

  const user = await User.findById(req.user.id).select('-password');
  res.json({ role: req.user.role, user });
}

module.exports = { getDashboard };
