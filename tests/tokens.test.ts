import { describe, it, expect } from 'vitest';
import { val, hex, ref, px, rem, ms, extractDependencies, extractVisualDependencies } from '../src/tokens';
import type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue } from '../src/tokens';

describe('val', () => {
  it('merges description onto an object', () => {
    const result = val({ type: 'color', rawValue: '#fff' }, { description: 'white' });
    expect(result.description).toBe('white');
    expect(result.type).toBe('color');
  });

  it('merges arbitrary options', () => {
    const result = val({ type: 'color', rawValue: '#fff' }, { description: 'x', custom: 42 });
    expect((result as any).custom).toBe(42);
  });
});

describe('hex', () => {
  it('creates a color TokenValue with culori processor', () => {
    const c = hex('#ff0000');
    expect(c.type).toBe('color');
    expect(c.rawValue).toBe('#ff0000');
    expect(c.processors).toHaveLength(1);
    expect(c.processors![0].name).toBe('culori');
    expect(c.processors![0].instance).toBeDefined();
    expect(c.metadata?.validated).toBe(true);
  });

  it('handles invalid colors gracefully', () => {
    const c = hex('not-a-color');
    expect(c.type).toBe('color');
    expect(c.metadata?.validated).toBe(false);
    expect(c.processors).toBeUndefined();
  });

  it('accepts description option', () => {
    const c = hex('#000', { description: 'black' });
    expect(c.description).toBe('black');
  });
});

describe('ref', () => {
  it('creates a ReferenceValue', () => {
    const r = ref('brand.primary');
    expect(r.type).toBe('reference');
    expect(r.key).toBe('brand.primary');
    expect(r.resolvedType).toBeUndefined();
    expect(r.resolvedMetadata?.isResolvable).toBeUndefined();
  });

  it('accepts description option', () => {
    const r = ref('x.y', { description: 'link' });
    expect(r.description).toBe('link');
  });
});

describe('px', () => {
  it('creates a dimension TokenValue with px unit', () => {
    const p = px(16);
    expect(p.type).toBe('dimension');
    expect(p.rawValue).toBe(16);
    expect(p.metadata?.unit).toBe('px');
    expect(p.metadata?.validated).toBe(true);
  });
});

describe('rem', () => {
  it('creates a dimension TokenValue with rem unit', () => {
    const r = rem(1.5);
    expect(r.type).toBe('dimension');
    expect(r.rawValue).toBe(1.5);
    expect(r.metadata?.unit).toBe('rem');
  });
});

describe('ms', () => {
  it('creates a dimension TokenValue with ms unit', () => {
    const t = ms(200);
    expect(t.type).toBe('dimension');
    expect(t.rawValue).toBe(200);
    expect(t.metadata?.unit).toBe('ms');
  });
});

describe('extractDependencies', () => {
  it('collects keys from ReferenceValue args', () => {
    const args = [hex('#fff'), ref('brand.primary'), 'literal', ref('brand.secondary')];
    expect(extractDependencies(args)).toEqual(['brand.primary', 'brand.secondary']);
  });

  it('returns empty array for no references', () => {
    expect(extractDependencies([hex('#fff'), 42])).toEqual([]);
  });
});

describe('extractVisualDependencies', () => {
  it('returns empty for non-scope args', () => {
    expect(extractVisualDependencies([hex('#fff'), ref('x')])).toEqual([]);
  });
});
