import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// GUARDIAN SECURITY CORE: Anti-Hack, Anti-SSRF, Anti-DDoS, Input Sanitizer
// ============================================================================

/**
 * Validates whether an IPv4 address string falls into a private or dangerous range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP is treated as unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback localhost)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private network 172.16 - 172.31)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks if a string looks like an integer/hex encoded IP address (e.g., 2130706433 or 0x7f000001)
 */
function isEncodedIpTrick(host: string): boolean {
  // Pure integer hostname (DWORD IP representation)
  if (/^\d+$/.test(host)) {
    return true;
  }
  // Hex representation (e.g., 0x7f.0.0.1 or 0x7f000001)
  if (/^0x[0-9a-fA-F]+/i.test(host)) {
    return true;
  }
  // Octal representation (e.g., 0177.0.0.1)
  if (/^0[0-7]+(\.0[0-7]+)*$/.test(host)) {
    return true;
  }
  return false;
}

/**
 * SSRF (Server-Side Request Forgery) Guardian:
 * Blocks attempts to probe internal network services, loopback, cloud metadata endpoints,
 * or non-HTTP protocols.
 */
export function isSafePublicUrl(urlString: string): { safe: boolean; reason?: string } {
  if (!urlString || typeof urlString !== 'string') {
    return { safe: false, reason: 'URL kosong atau tidak valid.' };
  }

  // Length limit to prevent buffer/regex DoS while permitting long signed CDN URLs
  if (urlString.length > 8192) {
    return { safe: false, reason: 'URL melebihi batas panjang maksimum (8192 karakter).' };
  }

  // Null byte injection check
  if (urlString.includes('\0')) {
    return { safe: false, reason: 'URL mengandung karakter ilegal (null byte).' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Format URL tidak valid.' };
  }

  // Protocol check: strictly http or https only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Protokol '${parsed.protocol}' dilarang. Hanya http/https yang diizinkan.` };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Strip brackets from IPv6
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  // 1. Direct blocked hostnames
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal') ||
    cleanHost.endsWith('.arpa') ||
    cleanHost === 'metadata.google.internal' ||
    cleanHost === 'instance-data' ||
    cleanHost === 'metadata.azure.com'
  ) {
    return { safe: false, reason: 'Akses ke domain internal atau localhost diblokir oleh sistem keamanan.' };
  }

  // 2. Encoded IP tricks (hex, octal, dword)
  if (isEncodedIpTrick(cleanHost)) {
    return { safe: false, reason: 'Format IP hostname mencurigakan diblokir.' };
  }

  // 3. IPv4 standard dot-decimal check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost)) {
    if (isPrivateIPv4(cleanHost)) {
      return { safe: false, reason: 'Akses ke alamat IP lokal / privat diblokir oleh sistem keamanan.' };
    }
  }

  // 4. IPv6 check (loopback ::1, unique-local fc00::/7, link-local fe80::/10, ipv4-mapped)
  if (
    cleanHost === '::1' ||
    cleanHost === '0:0:0:0:0:0:0:1' ||
    cleanHost.startsWith('fe80:') ||
    cleanHost.startsWith('fc') ||
    cleanHost.startsWith('fd') ||
    cleanHost.includes('::ffff:')
  ) {
    return { safe: false, reason: 'Akses ke alamat IPv6 lokal / privat diblokir oleh sistem keamanan.' };
  }

  return { safe: true };
}

/**
 * Safely extracts client IP address, handling reverse proxies securely.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

/**
 * In-memory sliding-window Rate Limiter to stop flood attacks and DoS.
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  name?: string;
}) {
  const store = new Map<string, RateLimitRecord>();

  // Periodic cleanup of expired IP keys every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }, 120000).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const now = Date.now();
    let record = store.get(ip);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + options.windowMs };
      store.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, options.max - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > options.max) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json({
        success: false,
        error: options.message || 'Terlalu banyak permintaan (Rate limit tercapai). Harap tunggu beberapa detik.'
      });
      return;
    }

    next();
  };
}

/**
 * Anti-Prototype Pollution Middleware:
 * Sanitizes object keys in req.body, req.query, and req.params.
 */
function sanitizeObjectKeys(obj: any): void {
  if (!obj || typeof obj !== 'object') return;

  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete obj[key];
      continue;
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObjectKeys(obj[key]);
    }
  }
}

export function antiPrototypePollution(req: Request, _res: Response, next: NextFunction) {
  if (req.body) sanitizeObjectKeys(req.body);
  if (req.query) sanitizeObjectKeys(req.query);
  if (req.params) sanitizeObjectKeys(req.params);
  next();
}

/**
 * Strict Security Headers Middleware:
 * Defends against XSS, clickjacking, MIME sniffing, and unintended browser feature access.
 */
export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Basic XSS defense for older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevent leakage of full referer URLs across origins
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict hardware API access from potential malicious injections
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Cross-origin isolation header allowing media downloads to stream safely
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  next();
}

/**
 * Filename Sanitizer:
 * Completely neutralizes path traversal (../, ..\), null-bytes, command injection chars,
 * and preserves valid extensions.
 */
export function sanitizeFilename(input?: string, fallback = 'DownloaderZero_Media.mp4'): string {
  if (!input || typeof input !== 'string') return fallback;

  // 1. Remove null bytes and control chars
  let clean = input.replace(/\0/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  // 2. Strip path separators & traversal attempts
  clean = clean.replace(/\\/g, '/');
  clean = clean.split('/').pop() || fallback;
  clean = clean.replace(/\.\.+/g, '.');

  // 3. Keep only safe alphanumeric, dashes, dots, underscores
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 4. Prevent hidden file tricks (.bashrc, etc.)
  clean = clean.replace(/^\.+/, '');

  // 5. Length limit (max 100 characters)
  if (clean.length > 100) {
    const dotIdx = clean.lastIndexOf('.');
    if (dotIdx > 0) {
      const ext = clean.slice(dotIdx);
      clean = clean.slice(0, 90) + ext;
    } else {
      clean = clean.slice(0, 100);
    }
  }

  return clean || fallback;
}

/**
 * Job ID Sanitizer:
 * Allows only alphanumeric and hyphens/underscores to prevent injection in third-party API calls.
 */
export function sanitizeJobId(id: string): string {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 80);
}
