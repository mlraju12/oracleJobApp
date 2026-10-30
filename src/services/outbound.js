const BLOCKED = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  '0.0.0.0',
  '::1',
]);

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.status = 400;
    this.code = 'UNSAFE_URL';
  }
}

function ipv4(host) {
  const parts = String(host || '').split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null;
  return nums;
}

function isPrivateIpv4(host) {
  const parts = ipv4(host);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function assertSafeOutboundUrl(raw, options = {}) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new UnsafeUrlError('Enter a valid http(s) URL.');
  }
  const allowHttp = options.allowHttp != null ? options.allowHttp : process.env.NODE_ENV !== 'production';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new UnsafeUrlError('Only public http(s) URLs can be collected.');
  }
  if (url.username || url.password) throw new UnsafeUrlError('URLs with credentials are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || BLOCKED.has(host) || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('That host is not a public collection target.');
  }
  if (host.includes(':') || isPrivateIpv4(host)) {
    throw new UnsafeUrlError('Private and link-local addresses are not collection targets.');
  }
  if (options.allowedHosts && !options.allowedHosts.includes(host)) {
    throw new UnsafeUrlError(`Host ${host} is outside this adapter allowlist.`);
  }
  return url;
}

module.exports = {
  UnsafeUrlError,
  assertSafeOutboundUrl,
};
