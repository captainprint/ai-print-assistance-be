require('dotenv').config();
const mongoose = require('mongoose');
const { syncProducts } = require('../services/syncService');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/print-assistance';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  await syncProducts();
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Sync error:', err);
  process.exit(1);
});
