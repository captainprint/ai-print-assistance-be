const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const { syncProducts } = require('./services/syncService');
const HandoffToken = require('./models/HandoffToken');
const CustomerToken = require('./models/CustomerToken');

const chatRoutes = require('./routes/chat');
const productRoutes = require('./routes/products');
const imageRoutes = require('./routes/images');
const adminAuthRoutes = require('./routes/adminAuth');
const authRoutes = require('./routes/auth');
const adminUserRoutes = require('./routes/adminUsers');
const menuRoutes = require('./routes/menu');
const dashboardRoutes = require('./routes/dashboard');
const handoffRoutes = require('./routes/handoff');

const app = express();

// Sync product data every day at 2:00 AM
cron.schedule('0 2 * * *', () => {
  syncProducts().catch((err) => console.error('[cron] Sync failed:', err.message));
});

// Purge expired handoff and customer tokens every night at 3:00 AM
cron.schedule('0 3 * * *', async () => {
  try {
    const now = new Date();
    const [h, c] = await Promise.all([
      HandoffToken.deleteMany({ expiresAt: { $lt: now } }),
      CustomerToken.deleteMany({ expiresAt: { $lt: now } }),
    ]);
    console.log(`[cron] Purged ${h.deletedCount} handoff tokens, ${c.deletedCount} customer tokens`);
  } catch (err) {
    console.error('[cron] Token purge failed:', err.message);
  }
});

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(rateLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/chat', chatRoutes);
app.use('/api/products', productRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/admin', adminAuthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/handoff', handoffRoutes);

app.use(errorHandler);

module.exports = app;
