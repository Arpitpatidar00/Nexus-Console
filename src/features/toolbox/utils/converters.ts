// Pure offline developer utility converters. Zero external runtime dependencies.

// --- JSON Tools ---
export function formatJson(
  input: string,
  indent = 2,
): { ok: boolean; result?: string; error?: string } {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, result: JSON.stringify(parsed, null, indent) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function minifyJson(input: string): { ok: boolean; result?: string; error?: string } {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, result: JSON.stringify(parsed) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function validateJson(input: string): {
  valid: boolean;
  error?: string;
  line?: number;
  column?: number;
} {
  try {
    JSON.parse(input);
    return { valid: true };
  } catch (e) {
    const msg = (e as Error).message;
    // Extract line/column if present in message (e.g. "at position X" or "line Y column Z")
    const match = /line (\d+) column (\d+)/i.exec(msg);
    if (match) {
      return {
        valid: false,
        error: msg,
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
      };
    }
    return { valid: false, error: msg };
  }
}

// --- JWT Decoder ---
export interface JwtDecoded {
  ok: boolean;
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  signature?: string;
  isExpired?: boolean;
  expiresAtFormatted?: string;
  issuedAtFormatted?: string;
  error?: string;
}

export function decodeJwt(token: string): JwtDecoded {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return {
      ok: false,
      error: 'Invalid JWT format: must contain header, payload, and signature separated by dots',
    };
  }

  try {
    const decodeBase64Url = (str: string) => {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) {
        b64 += '=';
      }
      return decodeURIComponent(
        atob(b64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
    };

    const header = JSON.parse(decodeBase64Url(parts[0])) as Record<string, unknown>;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;

    let isExpired: boolean | undefined;
    let expiresAtFormatted: string | undefined;
    let issuedAtFormatted: string | undefined;

    if (typeof payload.exp === 'number') {
      const expDate = new Date(payload.exp * 1000);
      isExpired = Date.now() >= expDate.getTime();
      expiresAtFormatted = expDate.toISOString();
    }

    if (typeof payload.iat === 'number') {
      issuedAtFormatted = new Date(payload.iat * 1000).toISOString();
    }

    return {
      ok: true,
      header,
      payload,
      signature: parts[2],
      isExpired,
      expiresAtFormatted,
      issuedAtFormatted,
    };
  } catch (e) {
    return { ok: false, error: 'Failed to decode JWT parts: ' + (e as Error).message };
  }
}

// --- Base64 & URL ---
export function encodeBase64(str: string): string {
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16)),
      ),
    );
  } catch {
    return btoa(str);
  }
}

export function decodeBase64(b64: string): string {
  try {
    return decodeURIComponent(
      atob(b64.trim())
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return atob(b64.trim());
  }
}

export function encodeUrl(str: string): string {
  return encodeURIComponent(str);
}

export function decodeUrl(urlStr: string): string {
  return decodeURIComponent(urlStr);
}

// --- Timestamp & Date ---
export function timestampToDate(
  ts: number | string,
  unit: 's' | 'ms' = 's',
): {
  iso: string;
  utc: string;
  local: string;
  epochSeconds: number;
  epochMillis: number;
} {
  const num = typeof ts === 'string' ? parseFloat(ts) : ts;
  const millis = unit === 's' ? Math.round(num * 1000) : Math.round(num);
  const date = new Date(millis);

  return {
    iso: isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString(),
    utc: isNaN(date.getTime()) ? 'Invalid Date' : date.toUTCString(),
    local: isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString(),
    epochSeconds: Math.floor(millis / 1000),
    epochMillis: millis,
  };
}

export function dateToTimestamp(dateStr: string): {
  seconds: number;
  millis: number;
  valid: boolean;
} {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return { seconds: 0, millis: 0, valid: false };
  }
  return {
    seconds: Math.floor(d.getTime() / 1000),
    millis: d.getTime(),
    valid: true,
  };
}

// --- UUID Tools ---
export function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    throw new Error('Web Crypto API is not available');
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function generateUuidV7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    throw new Error('Web Crypto API is not available');
  }

  // 48-bit timestamp
  bytes[0] = (now / 0x10000000000) & 0xff;
  bytes[1] = (now / 0x100000000) & 0xff;
  bytes[2] = (now / 0x1000000) & 0xff;
  bytes[3] = (now / 0x10000) & 0xff;
  bytes[4] = (now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // version 7 (0b0111)
  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  // variant 1 (0b10)
  bytes[8] = 0x80 | (bytes[8] & 0x3f);

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(('0' + bytes[i].toString(16)).slice(-2));
  }

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function parseUuid(uuid: string): {
  valid: boolean;
  version?: number;
  variant?: string;
  timestamp?: string;
} {
  const clean = uuid.trim().toLowerCase();
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-([89ab])[0-9a-f]{3}-[0-9a-f]{12}$/;
  const match = re.exec(clean);
  if (!match) {
    return { valid: false };
  }

  const version = parseInt(match[1], 10);
  const variant = 'RFC 4122 (variant 1)';

  let timestamp: string | undefined;
  if (version === 7) {
    const hexTs = clean.replace(/-/g, '').slice(0, 12);
    const ms = parseInt(hexTs, 16);
    timestamp = new Date(ms).toISOString();
  }

  return { valid: true, version, variant, timestamp };
}

// --- Regex Tester ---
export interface RegexMatch {
  match: string;
  index: number;
  groups: string[];
}

export function testRegex(
  pattern: string,
  flags: string,
  text: string,
): { matches: boolean; count: number; matchesList: RegexMatch[]; error?: string } {
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    const matchesList: RegexMatch[] = [];
    let m: RegExpExecArray | null;

    let limit = 500;
    while ((m = re.exec(text)) !== null && limit-- > 0) {
      matchesList.push({
        match: m[0],
        index: m.index,
        groups: m.slice(1),
      });
      if (m[0].length === 0) {
        re.lastIndex++;
      }
    }

    return {
      matches: matchesList.length > 0,
      count: matchesList.length,
      matchesList,
    };
  } catch (e) {
    return { matches: false, count: 0, matchesList: [], error: (e as Error).message };
  }
}

// --- Cron Explainer ---
export function explainCron(expr: string): { summary: string; nextRuns: string[]; error?: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return {
      summary: '',
      nextRuns: [],
      error: 'Cron expression must have 5 fields (or 6 with seconds)',
    };
  }

  const [min, hour, dom, mon, dow] = parts.length === 6 ? parts.slice(1) : parts;

  // Simple plain-text explainer
  const describeField = (f: string, unit: string) => {
    if (f === '*') return `every ${unit}`;
    if (f.startsWith('*/')) return `every ${f.slice(2)} ${unit}s`;
    return `at ${unit} ${f}`;
  };

  const summary = `Runs ${describeField(min, 'minute')}, ${describeField(hour, 'hour')}, on ${describeField(dom, 'day of month')}, in ${describeField(mon, 'month')}, and on ${describeField(dow, 'day of week')}.`;

  // Calculate next 5 approximate run dates
  const nextRuns: string[] = [];
  const now = new Date();
  let candidate = new Date(now.getTime() + 60000);

  for (let i = 0; i < 5; i++) {
    candidate = new Date(candidate.getTime() + (min === '*' ? 60000 : 3600000));
    nextRuns.push(candidate.toLocaleString());
  }

  return { summary, nextRuns };
}

// --- Hashes ---
export function computeMd5(string: string): string {
  function rotateLeft(lValue: number, iShiftBits: number) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }

  function addUnsigned(lX: number, lY: number) {
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }

  function F(x: number, y: number, z: number) {
    return (x & y) | (~x & z);
  }
  function G(x: number, y: number, z: number) {
    return (x & z) | (y & ~z);
  }
  function H(x: number, y: number, z: number) {
    return x ^ y ^ z;
  }
  function I(x: number, y: number, z: number) {
    return y ^ (x | ~z);
  }

  function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }

  const utf8 = encodeURIComponent(string).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16)),
  );

  const words: number[] = [];
  const messageLen = utf8.length;
  for (let i = 0; i < messageLen; i++) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << ((i % 4) * 8);
  }
  words[messageLen >> 2] |= 0x80 << ((messageLen % 4) * 8);
  words[(((messageLen + 8) >> 6) << 4) + 14] = messageLen * 8;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let i = 0; i < words.length; i += 16) {
    const [AA, BB, CC, DD] = [a, b, c, d];
    a = FF(a, b, c, d, words[i] || 0, 7, 0xd76aa478);
    d = FF(d, a, b, c, words[i + 1] || 0, 12, 0xe8c7b756);
    c = FF(c, d, a, b, words[i + 2] || 0, 17, 0x242070db);
    b = FF(b, c, d, a, words[i + 3] || 0, 22, 0xc1bdceee);
    a = FF(a, b, c, d, words[i + 4] || 0, 7, 0xf57c0faf);
    d = FF(d, a, b, c, words[i + 5] || 0, 12, 0x4787c62a);
    c = FF(c, d, a, b, words[i + 6] || 0, 17, 0xa8304613);
    b = FF(b, c, d, a, words[i + 7] || 0, 22, 0xfd469501);
    a = FF(a, b, c, d, words[i + 8] || 0, 7, 0x698098d8);
    d = FF(d, a, b, c, words[i + 9] || 0, 12, 0x8b44f7af);
    c = FF(c, d, a, b, words[i + 10] || 0, 17, 0xffff5bb1);
    b = FF(b, c, d, a, words[i + 11] || 0, 22, 0x895cd7be);
    a = FF(a, b, c, d, words[i + 12] || 0, 7, 0x6b901122);
    d = FF(d, a, b, c, words[i + 13] || 0, 12, 0xfd987193);
    c = FF(c, d, a, b, words[i + 14] || 0, 17, 0xa679438e);
    b = FF(b, c, d, a, words[i + 15] || 0, 22, 0x49b40821);

    a = GG(a, b, c, d, words[i + 1] || 0, 5, 0xf61e2562);
    d = GG(d, a, b, c, words[i + 6] || 0, 9, 0xc040b340);
    c = GG(c, d, a, b, words[i + 11] || 0, 14, 0x265e5a51);
    b = GG(b, c, d, a, words[i] || 0, 20, 0xe9b6c7aa);
    a = GG(a, b, c, d, words[i + 5] || 0, 5, 0xd62f105d);
    d = GG(d, a, b, c, words[i + 10] || 0, 9, 0x02441453);
    c = GG(c, d, a, b, words[i + 15] || 0, 14, 0xd8a1e681);
    b = GG(b, c, d, a, words[i + 4] || 0, 20, 0xe7d3fbc8);
    a = GG(a, b, c, d, words[i + 9] || 0, 5, 0x21e1cde6);
    d = GG(d, a, b, c, words[i + 14] || 0, 9, 0xc33707d6);
    c = GG(c, d, a, b, words[i + 3] || 0, 14, 0xf4d50d87);
    b = GG(b, c, d, a, words[i + 8] || 0, 20, 0x455a14ed);
    a = GG(a, b, c, d, words[i + 13] || 0, 5, 0xa9e3e905);
    d = GG(d, a, b, c, words[i + 2] || 0, 9, 0xfcefa3f8);
    c = GG(c, d, a, b, words[i + 7] || 0, 14, 0x676f02d9);
    b = GG(b, c, d, a, words[i + 12] || 0, 20, 0x8d2a4c8a);

    a = HH(a, b, c, d, words[i + 5] || 0, 4, 0xfffa3942);
    d = HH(d, a, b, c, words[i + 8] || 0, 11, 0x8771f681);
    c = HH(c, d, a, b, words[i + 11] || 0, 16, 0x6d9d6122);
    b = HH(b, c, d, a, words[i + 14] || 0, 23, 0xfde5380c);
    a = HH(a, b, c, d, words[i + 1] || 0, 4, 0xa4beea44);
    d = HH(d, a, b, c, words[i + 4] || 0, 11, 0x4bdecfa9);
    c = HH(c, d, a, b, words[i + 7] || 0, 16, 0xf6bb4b60);
    b = HH(b, c, d, a, words[i + 10] || 0, 23, 0xbebfbc70);
    a = HH(a, b, c, d, words[i + 13] || 0, 4, 0x289b7ec6);
    d = HH(d, a, b, c, words[i] || 0, 11, 0xeaa127fa);
    c = HH(c, d, a, b, words[i + 3] || 0, 16, 0xd4ef3085);
    b = HH(b, c, d, a, words[i + 6] || 0, 23, 0x04881d05);
    a = HH(a, b, c, d, words[i + 9] || 0, 4, 0xd9d4d039);
    d = HH(d, a, b, c, words[i + 12] || 0, 11, 0xe6db99e5);
    c = HH(c, d, a, b, words[i + 15] || 0, 16, 0x1fa27cf8);
    b = HH(b, c, d, a, words[i + 2] || 0, 23, 0xc4ac5665);

    a = II(a, b, c, d, words[i] || 0, 6, 0xf4292244);
    d = II(d, a, b, c, words[i + 7] || 0, 10, 0x432aff97);
    c = II(c, d, a, b, words[i + 14] || 0, 15, 0xab9423a7);
    b = II(b, c, d, a, words[i + 5] || 0, 21, 0xfc93a039);
    a = II(a, b, c, d, words[i + 12] || 0, 6, 0x655b59c3);
    d = II(d, a, b, c, words[i + 3] || 0, 10, 0x8f0ccc92);
    c = II(c, d, a, b, words[i + 10] || 0, 15, 0xffeff47d);
    b = II(b, c, d, a, words[i + 1] || 0, 21, 0x85845dd1);
    a = II(a, b, c, d, words[i + 8] || 0, 6, 0x6fa87e4f);
    d = II(d, a, b, c, words[i + 15] || 0, 10, 0xfe2ce6e0);
    c = II(c, d, a, b, words[i + 6] || 0, 15, 0xa3014314);
    b = II(b, c, d, a, words[i + 13] || 0, 21, 0x4e0811a1);
    a = II(a, b, c, d, words[i + 4] || 0, 6, 0xf7537e82);
    d = II(d, a, b, c, words[i + 11] || 0, 10, 0xbd3af235);
    c = II(c, d, a, b, words[i + 2] || 0, 15, 0x2ad7d2bb);
    b = II(b, c, d, a, words[i + 9] || 0, 21, 0xeb86d391);

    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }

  const wordToHex = (w: number) => {
    let hex = '';
    for (let i = 0; i < 4; i++) {
      hex += ('0' + ((w >> (i * 8)) & 0xff).toString(16)).slice(-2);
    }
    return hex;
  };

  return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
}

export async function computeSha256(str: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeSha1(str: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Color Conversion ---
export function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } | null {
  let c = hex.trim().replace(/^#/, '');
  if (c.length === 3) {
    c = c
      .split('')
      .map((x) => x + x)
      .join('');
  }
  if (c.length === 6) {
    c += 'ff';
  }
  if (c.length !== 8) return null;

  const num = parseInt(c, 16);
  if (isNaN(num)) return null;

  return {
    r: (num >> 24) & 255,
    g: (num >> 16) & 255,
    b: (num >> 8) & 255,
    a: Math.round(((num & 255) / 255) * 100) / 100,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}
