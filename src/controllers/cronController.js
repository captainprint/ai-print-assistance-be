const { syncProducts } = require('../services/syncService');
const { purgeExpiredTokens } = require('../services/maintenanceService');

async function runSyncProducts(req, res) {
  try {
    const result = await syncProducts();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron] Sync failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function runPurgeTokens(req, res) {
  try {
    const result = await purgeExpiredTokens();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron] Token purge failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { runSyncProducts, runPurgeTokens };
