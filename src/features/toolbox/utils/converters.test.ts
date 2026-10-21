import { describe, it, expect } from 'vitest';
import {
  formatJson,
  minifyJson,
  validateJson,
  decodeJwt,
  encodeBase64,
  decodeBase64,
  encodeUrl,
  decodeUrl,
  timestampToDate,
  dateToTimestamp,
  generateUuidV4,
  generateUuidV7,
  parseUuid,
  testRegex,
  computeMd5,
  computeSha256,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
} from './converters';

describe('Toolbox Converters', () => {
  it('formats and minifies JSON', () => {
    const raw = '{"a":1,"b":[2,3]}';
    const formatted = formatJson(raw);
    expect(formatted.ok).toBe(true);
    expect(formatted.result).toContain('\n');

    const minified = minifyJson(formatted.result!);
    expect(minified.ok).toBe(true);
    expect(minified.result).toBe(raw);
  });

  it('validates JSON correctly', () => {
    expect(validateJson('{"ok":true}').valid).toBe(true);
    expect(validateJson('{invalid}').valid).toBe(false);
  });

  it('decodes JWT header, payload, and expiry', () => {
    // Header: {"alg":"HS256","typ":"JWT"}, Payload: {"sub":"123","exp":1700000000}
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE3MDAwMDAwMDB9.signature';
    const decoded = decodeJwt(token);
    expect(decoded.ok).toBe(true);
    expect(decoded.header?.alg).toBe('HS256');
    expect(decoded.payload?.sub).toBe('123');
    expect(decoded.isExpired).toBe(true);
  });

  it('handles Base64 and URL encoding/decoding', () => {
    const text = 'Hello, Stackroost! 🚀';
    const b64 = encodeBase64(text);
    expect(decodeBase64(b64)).toBe(text);

    const url = 'foo bar & baz=123';
    expect(decodeUrl(encodeUrl(url))).toBe(url);
  });

  it('converts timestamp to and from date', () => {
    const ts = 1700000000;
    const res = timestampToDate(ts, 's');
    expect(res.iso).toBe('2023-11-14T22:13:20.000Z');

    const back = dateToTimestamp('2023-11-14T22:13:20.000Z');
    expect(back.valid).toBe(true);
    expect(back.seconds).toBe(1700000000);
  });

  it('generates and parses UUID v4 and v7', () => {
    const v4 = generateUuidV4();
    const p4 = parseUuid(v4);
    expect(p4.valid).toBe(true);
    expect(p4.version).toBe(4);

    const v7 = generateUuidV7();
    const p7 = parseUuid(v7);
    expect(p7.valid).toBe(true);
    expect(p7.version).toBe(7);
    expect(p7.timestamp).toBeDefined();
  });

  it('tests regular expressions', () => {
    const res = testRegex(
      '([a-zA-Z0-9]+)@([a-zA-Z0-9.]+)',
      'g',
      'Contact dev@stackroost.app or test@corp.io',
    );
    expect(res.matches).toBe(true);
    expect(res.count).toBe(2);
    expect(res.matchesList[0].groups[0]).toBe('dev');
  });

  it('computes MD5 and SHA-256 hashes', async () => {
    const md5 = computeMd5('hello world');
    expect(md5).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');

    const sha256 = await computeSha256('hello world');
    expect(sha256).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('converts HEX, RGB, and HSL colors', () => {
    const rgb = hexToRgb('#ff0000');
    expect(rgb).toEqual({ r: 255, g: 0, b: 0, a: 1 });

    const hex = rgbToHex(255, 0, 0);
    expect(hex).toBe('#ff0000');

    const hsl = rgbToHsl(255, 0, 0);
    expect(hsl).toEqual({ h: 0, s: 100, l: 50 });
  });
});
