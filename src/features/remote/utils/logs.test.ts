import { test, expect } from 'vitest';
import { entriesOf, filterEntries, isNoise, journalEntriesOf, levelOf } from './logs';

const at = '2026-10-23T17:41:15.709000000Z';

test('levels from the formats these apps actually write', () => {
  expect(levelOf('2026-10-23T17:41:15.709Z [INFO ] (GET /health) [8ecb] Incoming request')).toBe(
    'info',
  );
  expect(levelOf('[ERROR] (POST /api/v1/login) [abc] Unhandled exception')).toBe('error');
  expect(levelOf('[WARN ] slow query')).toBe('warn');
  expect(levelOf('{"level":"error","msg":"redis down"}')).toBe('error');
  expect(
    levelOf('127.0.0.1 - - [23/Oct/2026:17:41:15 +0000] "GET /x HTTP/1.1" 502 13 "-" "node"'),
  ).toBe('error');
  expect(
    levelOf('1.2.3.4 - - [22/Oct/2026:08:07:29 +0000] "GET /notify/.env HTTP/1.1" 404 652 "-" "x"'),
  ).toBe('warn');
  expect(levelOf('1.2.3.4 - - [22/Oct/2026:08:07:29 +0000] "GET / HTTP/1.1" 200 652 "-" "x"')).toBe(
    'info',
  );
  expect(levelOf('prisma:query SELECT 1')).toBe('debug');
  expect(levelOf('🚀 Server running on http://0.0.0.0:3000')).toBe('info');
  expect(levelOf('Error: connect ECONNREFUSED 127.0.0.1:6379')).toBe('error');
  // "stderr" and "terraform" must not read as errors.
  expect(levelOf('writing to stderr from /terraform/.env')).toBe('info');
});

test('health checks and per-query SQL are noise', () => {
  expect(isNoise('127.0.0.1 - - [x] "GET /health HTTP/1.1" 200 137 "-" "node"')).toBe(true);
  expect(isNoise('[INFO ] (GET /health) [id] Outgoing response')).toBe(true);
  expect(isNoise('prisma:query SELECT 1')).toBe(true);
  expect(isNoise('[INFO ] (GET /api/v1/users) [id] Outgoing response')).toBe(false);
});

test('continuations fold into the line above and can raise it to error', () => {
  const e = entriesOf([
    { at, text: 'prisma:query UPDATE "x"' },
    { at, text: '        WHERE (status = $1)' },
    { at, text: 'Something went wrong' },
    { at, text: '    at Object.<anonymous> (/app/x.js:1:1)' },
    { at, text: '}' },
    { at: null, text: 'TypeError: boom' },
  ]);
  expect(e).toHaveLength(3);
  expect(e[0].text).toBe('prisma:query UPDATE "x"\n        WHERE (status = $1)');
  expect(e[0].at).toBe(Date.parse(at));
  expect(e[1].text.split('\n')).toHaveLength(3);
  expect(e[2]).toMatchObject({ at: null, level: 'error' });
});

test('request ids are picked up', () => {
  const [e] = entriesOf([
    { at, text: '[INFO ] (GET /x) [8ecb5901-1913-47fd-ad38-57c431b022eb] done' },
  ]);
  expect(e.requestId).toBe('8ecb5901-1913-47fd-ad38-57c431b022eb');
});

test('journal lines keep their time and drop the hostname', () => {
  const [j] = journalEntriesOf([
    '2026-10-23T17:41:15+0000 ip-172-30-0-245 sshd[123]: error: kex failed',
  ]);
  expect(j.at).toBe(Date.parse('2026-10-23T17:41:15+00:00'));
  expect(j.text).toBe('sshd[123]: error: kex failed');
});

test('filters combine', () => {
  const e = entriesOf([
    { at, text: '[INFO ] (GET /health) [a] ok' },
    { at, text: '[WARN ] slow' },
    { at, text: '[ERROR] boom' },
    { at, text: '[INFO ] user login' },
  ]);
  expect(filterEntries(e, { level: 'all', hideNoise: true, query: '' })).toHaveLength(3);
  expect(
    filterEntries(e, { level: 'warn', hideNoise: true, query: '' }).map((x) => x.level),
  ).toEqual(['warn', 'error']);
  expect(filterEntries(e, { level: 'error', hideNoise: false, query: '' })).toHaveLength(1);
  expect(filterEntries(e, { level: 'all', hideNoise: false, query: 'LOGIN' })).toHaveLength(1);
});
