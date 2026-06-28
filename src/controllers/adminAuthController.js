const { signToken } = require('../middleware/auth');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function login(req, res) {
  const { username, password } = req.body;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(500).json({ message: 'Admin credentials not configured' });
  }
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = signToken({ role: 'admin', username: 'admin' });
  res.json({ token, user: { username: 'admin', role: 'admin' } });
}

async function logout(req, res) {
  res.json({ message: 'Logged out successfully' });
}

module.exports = { login, logout };
