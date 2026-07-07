const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const { syncProducts } = require('./services/syncService');

const chatRoutes = require('./routes/chat');
const productRoutes = require('./routes/products');
const imageRoutes = require('./routes/images');
const adminAuthRoutes = require('./routes/adminAuth');
const authRoutes = require('./routes/auth');
const adminUserRoutes = require('./routes/adminUsers');
const menuRoutes = require('./routes/menu');
const dashboardRoutes = require('./routes/dashboard');
const handoffRoutes = require('./routes/handoff');
const cronRoutes = require('./routes/cron');
const { purgeExpiredTokens } = require('./services/maintenanceService');

const app = express();

// On Vercel these run as scheduled HTTP calls to /api/v1/cron/* instead
// (serverless functions don't keep in-process timers alive).
if (!process.env.VERCEL) {
  // Sync product data every day at 2:00 AM
  cron.schedule('0 2 * * *', () => {
    syncProducts().catch((err) => console.error('[cron] Sync failed:', err.message));
  });

  // Purge expired handoff and customer tokens every night at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    try {
      const { handoffDeleted, customerDeleted } = await purgeExpiredTokens();
      console.log(`[cron] Purged ${handoffDeleted} handoff tokens, ${customerDeleted} customer tokens`);
    } catch (err) {
      console.error('[cron] Token purge failed:', err.message);
    }
  });
}

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(rateLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/images', imageRoutes);
app.use('/api/v1/admin', adminAuthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin/users', adminUserRoutes);
app.use('/api/v1/menu', menuRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/handoff', handoffRoutes);
app.use('/api/v1/cron', cronRoutes);

app.use(errorHandler);

module.exports = app;
