import { test, expect } from 'vitest';
import { describeStatus } from './HostStatus.config';

test('every state has a label, not just a colour', () => {
  expect(describeStatus('notConnected', 'unknown', 0, undefined)).toEqual({
    tone: 'neutral',
    label: 'Not connected',
  });
  expect(describeStatus('connecting', 'unknown', 0, undefined).label).toBe('Connecting…');
  expect(describeStatus('error', 'unknown', 0, 'hostKey')).toEqual({
    tone: 'danger',
    label: 'Host key not trusted',
  });
  expect(describeStatus('error', 'unknown', 0, 'shell').label).toBe("Can't connect");
});

test('connected hosts report their health', () => {
  expect(describeStatus('connected', 'unknown', 0, undefined).label).toBe('Connected');
  expect(describeStatus('connected', 'ok', 0, undefined)).toEqual({ tone: 'ok', label: 'Healthy' });
  expect(describeStatus('connected', 'warn', 1, undefined)).toEqual({
    tone: 'warn',
    label: '1 issue',
  });
  expect(describeStatus('connected', 'critical', 3, undefined)).toEqual({
    tone: 'danger',
    label: '3 issues',
  });
});
