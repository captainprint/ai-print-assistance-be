function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${err.message}`, err.stack);

  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message;

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
