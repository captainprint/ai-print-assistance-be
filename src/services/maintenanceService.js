const HandoffToken = require('../models/HandoffToken');
const CustomerToken = require('../models/CustomerToken');

async function purgeExpiredTokens() {
  const now = new Date();
  const [h, c] = await Promise.all([
    HandoffToken.deleteMany({ expiresAt: { $lt: now } }),
    CustomerToken.deleteMany({ expiresAt: { $lt: now } }),
  ]);
  return { handoffDeleted: h.deletedCount, customerDeleted: c.deletedCount };
}

module.exports = { purgeExpiredTokens };
