import { describe, expect, test } from 'vitest';
import type { KafkaMessage, Payload } from '../api/kafka.schema';
import {
  formatCount,
  fromLocalInput,
  groupStatus,
  hexDump,
  messageToJson,
  payloadPreview,
  plaintextPasswordRisk,
  prettyPayload,
  toLocalInput,
} from './format';

const text = (t: string, format: Payload['format'] = 'text'): Payload => ({
  format,
  text: t,
  base64: false,
  size: t.length,
  truncated: false,
  schemaId: null,
});

describe('formatCount', () => {
  test('exact below 100k, compact above', () => {
    expect(formatCount(null)).toBe('—');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(99_999)).toBe('99,999');
    expect(formatCount(250_000)).toBe('250K');
    expect(formatCount(1_000_000)).toBe('1M');
    expect(formatCount(1_250_000)).toBe('1.3M');
    expect(formatCount(3_000_000_000)).toBe('3B');
  });
});

describe('payload rendering', () => {
  test('pretty-prints JSON and leaves a truncated document alone', () => {
    expect(prettyPayload(text('{"a":1}', 'json'))).toBe('{\n  "a": 1\n}');
    expect(prettyPayload(text('{"a":', 'json'))).toBe('{"a":');
    expect(prettyPayload(text('hello'))).toBe('hello');
  });

  test('hex-dumps binary', () => {
    const dump = hexDump(btoa('AB\u0000ÿ'));
    expect(dump).toBe(`00000000  ${'41 42 00 ff'.padEnd(47)}  AB..`);
    expect(hexDump('not base64!!')).toBe('not base64!!');
  });

  test('previews on one line', () => {
    expect(payloadPreview(null)).toBe('null');
    expect(payloadPreview(text('{ "a" :\n 1 }', 'json'))).toBe('{"a":1}');
    expect(payloadPreview(text('x'.repeat(200)), 10)).toBe(`${'x'.repeat(10)}…`);
    expect(payloadPreview(text(''))).toBe('(empty)');
    expect(
      payloadPreview({
        format: 'schemaRegistry',
        text: 'AAE=',
        base64: true,
        size: 1234,
        truncated: false,
        schemaId: 7,
      }),
    ).toBe('schema #7 · binary · 1,234 B');
  });

  test('copies a message as plain data', () => {
    const m: KafkaMessage = {
      partition: 1,
      offset: 5,
      timestamp: 0,
      timestampType: 'create',
      key: text('k'),
      value: text('{"n":1}', 'json'),
      headers: [{ key: 'h', value: null }],
      size: 9,
    };
    expect(messageToJson(m)).toEqual({
      partition: 1,
      offset: 5,
      timestamp: '1970-01-01T00:00:00.000Z',
      key: 'k',
      value: { n: 1 },
      headers: { h: null },
    });
  });
});

describe('groupStatus', () => {
  test('lag without members is the one worth a look', () => {
    expect(groupStatus({ state: 'Stable', totalLag: 1e6, members: 3 }).tone).toBe('success');
    expect(groupStatus({ state: 'Empty', totalLag: 10, members: 0 })).toEqual({
      label: 'Inactive · lagging',
      tone: 'warning',
    });
    expect(groupStatus({ state: 'Empty', totalLag: 0, members: 0 }).tone).toBe('neutral');
    expect(groupStatus({ state: 'PreparingRebalance', totalLag: null, members: 1 }).label).toBe(
      'Rebalancing',
    );
    expect(groupStatus({ state: '', totalLag: null, members: null }).label).toBe('Unknown');
  });
});

describe('time input', () => {
  test('round-trips local time to the second', () => {
    const ms = new Date(2026, 9, 26, 14, 3, 7).getTime();
    expect(toLocalInput(ms)).toBe('2026-10-26T14:03:07');
    expect(fromLocalInput(toLocalInput(ms))).toBe(ms);
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('garbage')).toBeNull();
  });
});

describe('plaintextPasswordRisk', () => {
  test('only PLAIN without TLS to a remote host', () => {
    expect(plaintextPasswordRisk('saslPlaintext', 'PLAIN', 'kafka.prod:9092')).toBe(true);
    expect(plaintextPasswordRisk('saslPlaintext', 'PLAIN', 'localhost:9092, 127.0.0.1')).toBe(
      false,
    );
    expect(plaintextPasswordRisk('saslSsl', 'PLAIN', 'kafka.prod:9092')).toBe(false);
    expect(plaintextPasswordRisk('saslPlaintext', 'SCRAM-SHA-256', 'kafka.prod:9092')).toBe(false);
  });
});
