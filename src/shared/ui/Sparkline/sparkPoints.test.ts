import { test, expect } from 'vitest';
import { sparkPoints } from './sparkPoints';

test('spark points map 0–100 onto the box, skipping gaps', () => {
  expect(sparkPoints([50], 80, 20)).toBe('');
  expect(sparkPoints([0, 100], 80, 20)).toBe('0.0,20.0 80.0,0.0');
  expect(sparkPoints([0, null, 100], 80, 20)).toBe('0.0,20.0 80.0,0.0');
  expect(sparkPoints([150, -5], 10, 10)).toBe('0.0,0.0 10.0,10.0');
});
