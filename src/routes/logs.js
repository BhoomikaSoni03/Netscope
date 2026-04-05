const express = require('express');
const protect = require('../middleware/auth');
const NetworkLog = require('../models/NetworkLog');

const router = express.Router();
router.use(protect);

// ─────────────────────────────────────────────────────
// GET /api/logs
// Filters: type, status, since (last 24h / 7d / 30d or ISO date)
// ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = { userId: req.user._id };

    // Type filter
    if (req.query.type && ['ping','tcp','dns'].includes(req.query.type)) {
      filter.type = req.query.type;
    }
    // Status filter
    if (req.query.status) {
      filter.status = req.query.status;
    }
    // Date range filter (since=24h | 7d | 30d | ISO string)
    if (req.query.since) {
      let since;
      const v = req.query.since;
      if (v === '24h') since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      else if (v === '7d')  since = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
      else if (v === '30d') since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      else { since = new Date(v); }
      if (!isNaN(since)) filter.createdAt = { $gte: since };
    }

    const [logs, total] = await Promise.all([
      NetworkLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      NetworkLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: logs,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/logs/:id
router.get('/:id', async (req, res) => {
  try {
    const log = await NetworkLog.findOne({ _id: req.params.id, userId: req.user._id });
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/logs/:id
router.delete('/:id', async (req, res) => {
  try {
    const log = await NetworkLog.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    res.json({ success: true, message: 'Log deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/logs  (clear all)
router.delete('/', async (req, res) => {
  try {
    const result = await NetworkLog.deleteMany({ userId: req.user._id });
    res.json({ success: true, message: `Deleted ${result.deletedCount} log(s)` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
