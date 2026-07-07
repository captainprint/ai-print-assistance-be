const connectDB = require('../src/config/database');
const app = require('../src/app');

module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
