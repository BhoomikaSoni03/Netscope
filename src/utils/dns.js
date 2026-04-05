const dns = require('dns').promises;

const resolveDNS = async (hostname) => {
  try {
    const started = Date.now();

    const [a, aaaa, mx, ns, txt, cname] = await Promise.allSettled([
      dns.resolve4(hostname, { ttl: true }),   // A records with TTL
      dns.resolve6(hostname),                  // AAAA (IPv6)
      dns.resolveMx(hostname),                 // MX
      dns.resolveNs(hostname),                 // NS
      dns.resolveTxt(hostname),                // TXT
      dns.resolveCname(hostname),              // CNAME
    ]);

    const records = {};
    let ttl = null;

    if (a.status === 'fulfilled') {
      records.A = a.value.map(r => r.address);
      ttl = a.value[0]?.ttl ?? null;
    }
    if (aaaa.status === 'fulfilled') {
      records.AAAA = aaaa.value;
    }
    if (mx.status === 'fulfilled') {
      records.MX = mx.value.map(r => ({ exchange: r.exchange, priority: r.priority }));
    }
    if (ns.status === 'fulfilled') {
      records.NS = ns.value;
    }
    if (txt.status === 'fulfilled') {
      records.TXT = txt.value.map(parts => parts.join(''));
    }
    if (cname.status === 'fulfilled') {
      records.CNAME = cname.value;
    }

    if (Object.keys(records).length === 0) {
      return { status: 'failed', hostname, message: 'No DNS records found', checkedAt: new Date().toISOString() };
    }

    return {
      status: 'success',
      hostname,
      ttl,
      resolvedIn: `${Date.now() - started}ms`,
      records,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'failed',
      hostname,
      message: 'DNS resolution failed',
      error: error.message,
      checkedAt: new Date().toISOString(),
    };
  }
};

module.exports = { resolveDNS };
