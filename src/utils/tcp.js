const net = require('net');

const checkTCPPort = (host, port, timeout = 5000) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const startTime = Date.now();

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      const responseTimeMs = Date.now() - startTime;
      socket.destroy();
      resolve({
        status: 'success',
        host,
        port,
        open: true,
        responseTime: `${responseTimeMs}ms`,
        responseTimeMs,
        service: knownPort(port),
        checkedAt: new Date().toISOString(),
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        status: 'timeout',
        host,
        port,
        open: false,
        responseTime: null,
        service: knownPort(port),
        message: `Connection to ${host}:${port} timed out`,
        checkedAt: new Date().toISOString(),
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({
        status: 'failed',
        host,
        port,
        open: false,
        responseTime: null,
        service: knownPort(port),
        message: `Port ${port} is closed or unreachable on ${host}`,
        error: err.message,
        checkedAt: new Date().toISOString(),
      });
    });
  });
};

// Common port → service name
function knownPort(port) {
  const map = {
    21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
    110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 465: 'SMTPS',
    587: 'SMTP/TLS', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL',
    5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB',
    8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 3000: 'Node Dev',
    5000: 'Generic', 5001: 'NetScope',
  };
  return map[port] || 'Unknown';
}

module.exports = { checkTCPPort };
