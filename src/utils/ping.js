const { execFile } = require('child_process');
const os = require('os');

// Allowlist: only valid hostname/IP characters
const SAFE_TARGET_RE = /^[a-zA-Z0-9.\-:]+$/;

const pingHost = (target) => {
  return new Promise((resolve) => {
    if (!target || target.length > 253) {
      return resolve({ status: 'failed', target, message: 'Invalid target' });
    }
    if (!SAFE_TARGET_RE.test(target)) {
      return resolve({ status: 'failed', target, message: 'Invalid target: forbidden characters' });
    }

    const flag = os.platform() === 'win32' ? '-n' : '-c';
    const args = [flag, '4', target];

    execFile('ping', args, { timeout: 10000 }, (error, stdout) => {
      if (error) {
        return resolve({
          status: 'failed',
          target,
          latency: null,
          packetLoss: '100%',
          stability: 'unreachable',
          message: 'Host unreachable or ping failed',
          checkedAt: new Date().toISOString(),
        });
      }

      // Parse latency stats
      const macMatch = stdout.match(/min\/avg\/max\/stddev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      const linuxMatch = stdout.match(/min\/avg\/max = ([\d.]+)\/([\d.]+)\/([\d.]+)/);
      const winMatch = stdout.match(/Average = (\d+)ms/);

      let minMs = null, avgMs = null, maxMs = null, jitterMs = null;

      if (macMatch) {
        minMs  = parseFloat(macMatch[1]);
        avgMs  = parseFloat(macMatch[2]);
        maxMs  = parseFloat(macMatch[3]);
        jitterMs = parseFloat(macMatch[4]);
      } else if (linuxMatch) {
        minMs = parseFloat(linuxMatch[1]);
        avgMs = parseFloat(linuxMatch[2]);
        maxMs = parseFloat(linuxMatch[3]);
        jitterMs = +(maxMs - minMs).toFixed(2);
      } else if (winMatch) {
        avgMs = parseFloat(winMatch[1]);
      }

      // Parse packet loss
      const lossMatch = stdout.match(/([\d.]+)%\s+packet loss/);
      const packetLossVal = lossMatch ? parseFloat(lossMatch[1]) : 0;
      const packetLoss = `${packetLossVal}%`;

      // Determine stability
      let stability = 'stable';
      if (packetLossVal > 50) stability = 'unstable';
      else if (packetLossVal > 0 || (jitterMs !== null && jitterMs > 50)) stability = 'degraded';

      resolve({
        status: 'success',
        target,
        latency: avgMs !== null ? `${avgMs}ms` : null,
        latencyMs: avgMs,
        minLatencyMs: minMs,
        maxLatencyMs: maxMs,
        jitterMs,
        packetLoss,
        stability,
        checkedAt: new Date().toISOString(),
      });
    });
  });
};

module.exports = { pingHost };
