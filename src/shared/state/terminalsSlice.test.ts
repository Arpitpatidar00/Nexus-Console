import { test, expect } from 'vitest';
import { openTerminal, terminalKey, terminalsReducer, setTerminalCap } from './terminalsSlice';

test('keys distinguish every target, and brew keys keep formula + kind', () => {
  const keys = [
    terminalKey({ type: 'brew', formula: 'redis', kind: 'cli' }),
    terminalKey({ type: 'brew', formula: 'redis', kind: 'logs' }),
    terminalKey({ type: 'remoteShell', hostId: 'h_1' }),
    terminalKey({ type: 'remoteLogs', hostId: 'h_1', container: 'web' }),
    terminalKey({ type: 'remoteExec', hostId: 'h_1', container: 'web' }),
    terminalKey({ type: 'remoteLogs', hostId: 'h_2', container: 'web' }),
  ];
  expect(new Set(keys).size).toBe(keys.length);
});

test('reopening the same target focuses it instead of spawning another', () => {
  const logs = { type: 'remoteLogs', hostId: 'h_1', container: 'web' } as const;
  let s = terminalsReducer(undefined, openTerminal({ target: logs, title: 'web · logs' }));
  s = terminalsReducer(
    s,
    openTerminal({ target: { type: 'brew', formula: 'redis', kind: 'cli' }, title: 'Redis' }),
  );
  const firstId = s.sessions[0].id;
  s = terminalsReducer(s, openTerminal({ target: { ...logs }, title: 'web · logs' }));
  expect(s.sessions).toHaveLength(2);
  expect(s.activeId).toBe(firstId);
  expect(s.drawerOpen).toBe(true);
});

test('brew cli and logs for one formula are two terminals (unchanged behaviour)', () => {
  let s = terminalsReducer(
    undefined,
    openTerminal({ target: { type: 'brew', formula: 'redis', kind: 'cli' }, title: 'Redis' }),
  );
  s = terminalsReducer(
    s,
    openTerminal({
      target: { type: 'brew', formula: 'redis', kind: 'logs' },
      title: 'Redis · logs',
    }),
  );
  expect(s.sessions).toHaveLength(2);
});

test('terminal cap is 8 by default, rejects 9th session', () => {
  let s = terminalsReducer(undefined, { type: '@@INIT' });
  expect(s.cap).toBe(8);
  for (let i = 0; i < 8; i++) {
    s = terminalsReducer(
      s,
      openTerminal({
        target: { type: 'remoteShell', hostId: `host_${i}` },
        title: `Host ${i}`,
      }),
    );
  }
  expect(s.sessions).toHaveLength(8);

  // Attempting 9th session is capped
  s = terminalsReducer(
    s,
    openTerminal({
      target: { type: 'remoteShell', hostId: 'host_9' },
      title: 'Host 9',
    }),
  );
  expect(s.sessions).toHaveLength(8);
});

test('setTerminalCap adjusts the dynamic session cap', () => {
  let s = terminalsReducer(undefined, setTerminalCap(3));
  expect(s.cap).toBe(3);
  for (let i = 0; i < 5; i++) {
    s = terminalsReducer(
      s,
      openTerminal({
        target: { type: 'remoteShell', hostId: `cap_${i}` },
        title: `Cap ${i}`,
      }),
    );
  }
  expect(s.sessions).toHaveLength(3);
});
