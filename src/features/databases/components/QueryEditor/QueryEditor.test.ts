import { describe, it, expect } from 'vitest';
import { normalizeSqlText } from './QueryEditor';

describe('normalizeSqlText', () => {
  it('turns curly single quotes into straight ones', () => {
    expect(normalizeSqlText('SELECT ‘deleted_users_backup’')).toBe("SELECT 'deleted_users_backup'");
  });

  it('turns curly double quotes into straight ones', () => {
    expect(normalizeSqlText('SELECT “name” FROM users')).toBe('SELECT "name" FROM users');
  });

  it('turns en/em dashes into hyphens', () => {
    expect(normalizeSqlText('col1 – col2 — col3')).toBe('col1 - col2 - col3');
  });

  it('leaves plain SQL untouched', () => {
    const sql = "SELECT * FROM users WHERE name = 'bob';";
    expect(normalizeSqlText(sql)).toBe(sql);
  });
});
