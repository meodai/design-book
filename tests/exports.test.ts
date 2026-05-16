import { describe, it, expect } from 'vitest';
import * as designBook from '../src/index';

describe('public exports', () => {
  it('exports ramp and rampStops', () => {
    expect(typeof designBook.ramp).toBe('function');
    expect(typeof designBook.rampStops).toBe('function');
  });
});
