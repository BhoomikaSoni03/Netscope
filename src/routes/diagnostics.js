const express = require('express');
const protect = require('../middleware/auth');
const { pingHost } = require('../utils/ping');
const { checkTCPPort } = require('../utils/tcp');
const { resolveDNS } = require('../utils/dns');
const NetworkLog = require('../models/NetworkLog');
const Alert = require('../models/Alert');
const { getRedis } = require('../config/redis');

const router = express.Router();
router.use(protect);

// ── Cache TTLs (seconds) ──────────────────────────────
const CACHE_TTL = { ping: 30, tcp: 60, dns: 120 };

// ── Redis helpers ─────────────────────────────────────
const cacheKey = (type, target, port) =>
  port ? `diag:${type}:${target}:${port}` : `diag:${type}:${target}`;

async function fromCache(key) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return null;
  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

async function toCache(key, data, ttl) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return;
  try { await redis.setex(key, ttl, JSON.stringify(data)); } catch {}
}

// ── Save to DB + update alert tracker ─────────────────
async function saveLog(userId, type, target, port, result, fromCacheFlag) {
  const status = result.status || 'failed';
  const log = await NetworkLog.create({
    userId, type, target,
    port: port || null,
    result, status,
    fromCache: fromCacheFlag,
  });

  // ── Alert tracking (Phase 4) ─────────────────────────
  if (type === 'ping') {
    let alert = await Alert.findOne({ userId, target, type });
    if (!alert) {
      alert = await Alert.create({ userId, target, type, threshold: 3 });
    }

    if (status === 'success') {
      // Reset failure streak on success
      if (alert.consecutiveFailures > 0) {
        await Alert.findByIdAndUpdate(alert._id, {
          consecutiveFailures: 0, resolved: true, triggered: false,
        });
      }
    } else {
      // Increment failures; fire alert if threshold hit
      const newCount = alert.consecutiveFailures + 1;
      const triggered = newCount >= alert.threshold;
      await Alert.findByIdAndUpdate(alert._id, {
        consecutiveFailures: newCount,
        triggered,
        resolved: false,
        ...(triggered ? {
          lastTriggeredAt: new Date(),
          message: `🚨 ${target} has failed ${newCount} consecutive ping checks`,
        } : {}),
      });
    }
  }

  return log;
}

// ─────────────────────────────────────────────────────
// POST /api/diagnostics/ping
// ─────────────────────────────────────────────────────
router.post('/ping', async (req, res) => {
  try {
    const { target } = req.body;
    if (!target) return res.status(400).json({ success: false, message: '`target` is required' });

    const key = cacheKey('ping', target);
    const cached = await fromCache(key);
    if (cached) {
      return res.json({ success: true, fromCache: true, cacheKey: key, data: cached.result });
    }

    const result = await pingHost(target);
    await toCache(key, { result }, CACHE_TTL.ping);
    const log = await saveLog(req.user._id, 'ping', target, null, result, false);

    res.json({ success: true, fromCache: false, logId: log._id, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────
// POST /api/diagnostics/tcp
// ─────────────────────────────────────────────────────
router.post('/tcp', async (req, res) => {
  try {
    const { host, port } = req.body;
    if (!host || !port) return res.status(400).json({ success: false, message: '`host` and `port` are required' });
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535)
      return res.status(400).json({ success: false, message: 'Invalid port (1-65535)' });

    const key = cacheKey('tcp', host, portNum);
    const cached = await fromCache(key);
    if (cached) {
      return res.json({ success: true, fromCache: true, cacheKey: key, data: cached.result });
    }

    const result = await checkTCPPort(host, portNum);
    await toCache(key, { result }, CACHE_TTL.tcp);
    const log = await saveLog(req.user._id, 'tcp', host, portNum, result, false);

    res.json({ success: true, fromCache: false, logId: log._id, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────
// POST /api/diagnostics/dns
// ─────────────────────────────────────────────────────
router.post('/dns', async (req, res) => {
  try {
    const { hostname } = req.body;
    if (!hostname) return res.status(400).json({ success: false, message: '`hostname` is required' });

    const key = cacheKey('dns', hostname);
    const cached = await fromCache(key);
    if (cached) {
      return res.json({ success: true, fromCache: true, cacheKey: key, data: cached.result });
    }

    const result = await resolveDNS(hostname);
    await toCache(key, { result }, CACHE_TTL.dns);
    const log = await saveLog(req.user._id, 'dns', hostname, null, result, false);

    res.json({ success: true, fromCache: false, logId: log._id, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────
// POST /api/diagnostics/multi   (Phase 4)
// Body: { targets: ["google.com","github.com"], type: "ping" }
// ─────────────────────────────────────────────────────
router.post('/multi', async (req, res) => {
  try {
    const { targets, type = 'ping', port } = req.body;
    if (!Array.isArray(targets) || targets.length === 0)
      return res.status(400).json({ success: false, message: '`targets` must be a non-empty array' });
    if (targets.length > 10)
      return res.status(400).json({ success: false, message: 'Maximum 10 targets per multi-check' });

    // Run all checks in parallel
    const results = await Promise.all(
      targets.map(async (target) => {
        target = String(target).trim();
        let result;
        if (type === 'ping') result = await pingHost(target);
        else if (type === 'tcp') result = await checkTCPPort(target, parseInt(port) || 80);
        else if (type === 'dns') result = await resolveDNS(target);
        else result = { status: 'failed', message: 'Unknown type' };

        // Save each to DB
        try {
          await saveLog(req.user._id, type, target, port || null, result, false);
        } catch {}

        return { target, ...result };
      })
    );

    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status !== 'success').length,
    };

    res.json({ success: true, type, summary, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────
// GET /api/diagnostics/alerts    (Phase 4)
// ─────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json({ success: true, total: alerts.length, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/diagnostics/alerts/:id
router.delete('/alerts/:id', async (req, res) => {
  try {
    await Alert.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Alert dismissed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
