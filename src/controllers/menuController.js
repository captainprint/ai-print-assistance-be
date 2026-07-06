const MENUS = {
  admin: [
    { key: 'dashboard', label: 'Dashboard', path: '/admin/dashboard' },
    { key: 'conversations', label: 'Conversations', path: '/admin/conversations' },
    { key: 'users', label: 'Users', path: '/admin/users' },
    { key: 'settings', label: 'Settings', path: '/admin/settings' },
  ],
  default: [
    { key: 'conversations', label: 'Conversations', path: '/admin/conversations' },
  ],
};

function getMenu(req, res) {
  const menu = req.user.role === 'admin' ? MENUS.admin : MENUS.default;
  res.json({ menu });
}

module.exports = { getMenu };
