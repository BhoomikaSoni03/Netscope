require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');

// ── Rate Limiters ───────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please slow down.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

const app = express();

// ── Database Connections (first) ────────────
connectDB();
connectRedis();

// ── Core Middleware ─────────────────────────
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(morgan('dev'));
app.use(globalLimiter);

// ── Static Frontend ─────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ──────────────────────────────
app.use('/api/auth',        authLimiter, require('./routes/auth'));
app.use('/api/diagnostics',              require('./routes/diagnostics'));
app.use('/api/logs',                     require('./routes/logs'));

// ── Health Check ────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'NetScope API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 Handler ─────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler ─────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`\n🚀 NetScope API running on http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health\n`);
});

module.exports = app;
