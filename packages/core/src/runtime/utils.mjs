import { isIP } from 'node:net';

export function validateExternalHttps(urlString) {
  const url = new URL(urlString);
  if (url.protocol !== 'https:') {
    throw new Error(`refusing non-HTTPS gateway URL: ${url.protocol}`);
  }
  const hostname = url.hostname.toLowerCase();

  if (isBlockedHostname(hostname)) {
    throw new Error(`refusing internal/reserved hostname: ${hostname}`);
  }

  let ipVersion = 0;
  try {
    ipVersion = isIP(hostname);
  } catch {
    // If isIP throws (very rare), skip IP check; hostname check above still applies.
  }
  if (ipVersion > 0 && isPrivateOrReservedIP(hostname, ipVersion)) {
    throw new Error(`refusing private/reserved IP address: ${hostname}`);
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
]);

const BLOCKED_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
];

function isBlockedHostname(hostname) {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (hostname === 'metadata.google.internal') return true;
  if (hostname.endsWith('.metadata.google.internal')) return true;
  for (const suffix of BLOCKED_SUFFIXES) {
    if (hostname.endsWith(suffix)) return true;
  }
  return false;
}

function isPrivateOrReservedIP(ip, version) {
  if (version === 4) return isIPv4PrivateOrReserved(ip);
  if (version === 6) return isIPv6PrivateOrReserved(ip);
  return false;
}

function isIPv4PrivateOrReserved(ip) {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isFinite(o))) return true;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0 && b === 0 && octets[2] === 0 && octets[3] === 0) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isIPv6PrivateOrReserved(ip) {
  const ipLower = ip.toLowerCase();
  if (ipLower === '::1') return true;
  if (ipLower.startsWith('fe80:')) return true;
  if (ipLower.startsWith('fc') || ipLower.startsWith('fd')) return true;
  if (ipLower.startsWith('::ffff:')) {
    const v4Part = ipLower.split('::ffff:')[1];
    if (v4Part) return isIPv4PrivateOrReserved(v4Part);
  }
  return false;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

export function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round(value) {
  return Math.round(value * 100) / 100;
}

export function roundMs(value) {
  return Math.round(Number(value) * 100) / 100;
}
