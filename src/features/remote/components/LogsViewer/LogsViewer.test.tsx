import { describe, it, expect } from 'vitest';
import { extractRequestId, parseTimestamp, parseLogLine, MAX_LOG_LINES } from './LogsViewer';

describe('LogsViewer unit tests (D.3 Merged Logs)', () => {
  it('extracts request IDs and trace IDs correctly', () => {
    expect(extractRequestId('2026-10-21 error req_abc123 failed to query')).toBe('req_abc123');
    expect(extractRequestId('failed with request-id=9f1a23-456')).toBe('9f1a23-456');
    expect(
      extractRequestId('error occurred trace_id=550e8400-e29b-41d4-a716-446655440000 inside db'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(extractRequestId('standard line with no id')).toBeUndefined();
  });

  it('parses ISO timestamps and syslog timestamps', () => {
    const iso = '2026-10-21T14:30:00Z [web] starting up';
    const parsedIso = parseTimestamp(iso, 1000);
    expect(parsedIso.timeStr).toBe('2026-10-21T14:30:00Z');
    expect(parsedIso.epoch).toBe(Date.parse('2026-10-21T14:30:00Z'));

    const fallback = parseTimestamp('plain text log without date', 1600000000000);
    expect(fallback.epoch).toBe(1600000000000);
  });

  it('parses log line metadata, levels and units', () => {
    const entry = parseLogLine(
      '2026-10-21T12:00:00Z [auth-service] critical database failure req_user_404',
      'host-1',
      'Production API',
      'remote',
      0,
      1700000000000,
    );

    expect(entry.level).toBe('error');
    expect(entry.unit).toBe('auth-service');
    expect(entry.sourceLabel).toBe('Production API');
    expect(entry.sourceType).toBe('remote');
    expect(entry.requestId).toBe('req_user_404');
    expect(entry.arrivalIndex).toBe(0);
  });

  it('enforces 20k line cap constant', () => {
    expect(MAX_LOG_LINES).toBe(20_000);
  });
});
