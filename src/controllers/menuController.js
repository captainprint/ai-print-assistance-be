const MENUS = {
  admin: [
    { key: 'users', label: 'Users', path: '/admin/users' },
    { key: 'support', label: 'Support', path: '/support' },
  ],
  default: [
    { key: 'support', label: 'Support', path: '/support' },
  ],
};

function getMenu(req, res) {
  const menu = req.user.role === 'admin' ? MENUS.admin : MENUS.default;
  res.json({ menu });
}

module.exports = { getMenu };
