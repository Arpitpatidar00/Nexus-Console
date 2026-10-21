import { describe, it, expect } from 'vitest';
import {
  packageDtoSchema,
  packagesSchema,
  outdatedDtoSchema,
  packageInfoSchema,
} from './packages.schema';

describe('packages schemas', () => {
  it('parses valid package DTO', () => {
    const raw = {
      name: 'postgresql@16',
      version: '16.2',
      kind: 'formula',
      outdated: false,
      latestVersion: null,
      pinned: false,
    };
    const parsed = packageDtoSchema.parse(raw);
    expect(parsed.name).toBe('postgresql@16');
    expect(parsed.kind).toBe('formula');
  });

  it('parses list of packages', () => {
    const raw = [
      {
        name: 'redis',
        version: '7.2.4',
        kind: 'formula',
        outdated: true,
        latestVersion: '7.2.5',
        pinned: true,
      },
      {
        name: 'docker',
        version: '24.0.0',
        kind: 'cask',
        outdated: false,
        latestVersion: null,
        pinned: false,
      },
    ];
    const parsed = packagesSchema.parse(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].pinned).toBe(true);
    expect(parsed[1].kind).toBe('cask');
  });

  it('rejects invalid package kind', () => {
    const raw = {
      name: 'bad-pkg',
      version: '1.0',
      kind: 'unknown_kind',
      outdated: false,
      latestVersion: null,
      pinned: false,
    };
    expect(() => packageDtoSchema.parse(raw)).toThrow();
  });

  it('parses outdated DTO', () => {
    const raw = {
      name: 'node',
      latestVersion: '22.0.0',
      pinned: false,
    };
    const parsed = outdatedDtoSchema.parse(raw);
    expect(parsed.name).toBe('node');
    expect(parsed.latestVersion).toBe('22.0.0');
  });

  it('parses package info DTO', () => {
    const raw = {
      name: 'nginx',
      description: 'HTTP and reverse proxy server',
      homepage: 'https://nginx.org',
      version: '1.25.4',
      dependencies: ['openssl@3', 'pcre2'],
      isService: true,
      isCask: false,
    };
    const parsed = packageInfoSchema.parse(raw);
    expect(parsed.name).toBe('nginx');
    expect(parsed.isService).toBe(true);
    expect(parsed.dependencies).toEqual(['openssl@3', 'pcre2']);
  });
});
