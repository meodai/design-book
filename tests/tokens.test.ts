import { describe, it, expect } from 'vitest';
import {
  val,
  color,
  ref,
  px,
  rem,
  ms,
  dimension,
  string,
  extractDependencies,
  extractVisualDependencies,
  getReferenceResolution,
  getTokenProcessors,
} from '../src/tokens';

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

describe('color', () => {
  it('creates a color TokenValue with culori processor', () => {
    const c = color('#ff0000');
    const processors = getTokenProcessors(c);
    expect(c.type).toBe('color');
    expect(c.rawValue).toBe('#ff0000');
    expect(processors).toHaveLength(1);
    expect(processors![0].name).toBe('culori');
    expect(processors![0].instance).toBeDefined();
    expect(c.metadata?.validated).toBe(true);
  });

  it('throws on invalid colors', () => {
    expect(() => color('not-a-color')).toThrow('Invalid color: not-a-color');
  });

  it('accepts description option', () => {
    const c = color('#000', { description: 'black' });
    expect(c.description).toBe('black');
  });

  it('accepts CSS named colors', () => {
    const c = color('red');
    expect(c.type).toBe('color');
    expect(c.rawValue).toBe('red');
    expect(getTokenProcessors(c)).toHaveLength(1);
  });
});

describe('ref', () => {
  it('creates a ReferenceValue', () => {
    const r = ref('brand.primary');
    expect(r.type).toBe('reference');
    expect(r.key).toBe('brand.primary');
    expect(getReferenceResolution(r)).toBeUndefined();
  });

  it('accepts description option', () => {
    const r = ref('x.y', { description: 'link' });
    expect(r.description).toBe('link');
  });
});

describe('dimension', () => {
  it('creates a dimension TokenValue with given unit', () => {
    const d = dimension(16, 'px');
    expect(d.type).toBe('dimension');
    expect(d.rawValue).toBe(16);
    expect(d.metadata?.unit).toBe('px');
    expect(d.metadata?.validated).toBe(true);
  });

  it('works with arbitrary units', () => {
    const d = dimension(50, '%');
    expect(d.type).toBe('dimension');
    expect(d.rawValue).toBe(50);
    expect(d.metadata?.unit).toBe('%');
  });

  it('accepts description option', () => {
    const d = dimension(1, 'em', { description: 'base em' });
    expect(d.description).toBe('base em');
  });

  it('throws on NaN', () => {
    expect(() => dimension(NaN, 'px')).toThrow('Invalid dimension value: NaN');
  });

  it('throws on Infinity', () => {
    expect(() => dimension(Infinity, 'px')).toThrow('Invalid dimension value: Infinity');
  });

  it('throws on -Infinity', () => {
    expect(() => dimension(-Infinity, 'px')).toThrow('Invalid dimension value: -Infinity');
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

  it('delegates to dimension', () => {
    expect(() => px(NaN)).toThrow('Invalid dimension value: NaN');
  });
});

describe('rem', () => {
  it('creates a dimension TokenValue with rem unit', () => {
    const r = rem(1.5);
    expect(r.type).toBe('dimension');
    expect(r.rawValue).toBe(1.5);
    expect(r.metadata?.unit).toBe('rem');
  });

  it('delegates to dimension', () => {
    expect(() => rem(Infinity)).toThrow('Invalid dimension value: Infinity');
  });
});

describe('ms', () => {
  it('creates a dimension TokenValue with ms unit', () => {
    const t = ms(200);
    expect(t.type).toBe('dimension');
    expect(t.rawValue).toBe(200);
    expect(t.metadata?.unit).toBe('ms');
  });

  it('delegates to dimension', () => {
    expect(() => ms(NaN)).toThrow('Invalid dimension value: NaN');
  });
});

describe('string', () => {
  it('creates a string TokenValue', () => {
    const s = string('hello');
    expect(s.type).toBe('string');
    expect(s.rawValue).toBe('hello');
  });

  it('accepts description option', () => {
    const s = string('world', { description: 'greeting' });
    expect(s.description).toBe('greeting');
  });

  it('throws on non-string values', () => {
    expect(() => string(42 as any)).toThrow('Expected string, got number');
    expect(() => string(null as any)).toThrow('Expected string, got object');
    expect(() => string(undefined as any)).toThrow('Expected string, got undefined');
  });
});

describe('extractDependencies', () => {
  it('collects keys from ReferenceValue args', () => {
    const args = [color('#fff'), ref('brand.primary'), 'literal', ref('brand.secondary')];
    expect(extractDependencies(args)).toEqual(['brand.primary', 'brand.secondary']);
  });

  it('returns empty array for no references', () => {
    expect(extractDependencies([color('#fff'), 42])).toEqual([]);
  });
});

describe('extractVisualDependencies', () => {
  it('returns empty for non-scope args', () => {
    expect(extractVisualDependencies([color('#fff'), ref('x')])).toEqual([]);
  });
});
