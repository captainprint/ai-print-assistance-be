const mongoose = require('mongoose');

// Cached across invocations so warm Vercel function instances reuse one
// connection instead of opening a new one on every request.
let connectionPromise = null;

function connectDB() {
  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/print-assistance';
    connectionPromise = mongoose.connect(uri)
      .then((m) => {
        console.log('MongoDB connected');
        return m;
      })
      .catch((err) => {
        connectionPromise = null;
        throw err;
      });
  }
  return connectionPromise;
}

module.exports = connectDB;
