import { describe, it, expect } from 'vitest';
import { parseKey, splitKey, scopeOf } from '../src/keys';
import { ref } from '../src/tokens';
import { TokenError } from '../src/errors';

describe('parseKey', () => {
  it('takes every key shape apart', () => {
    expect(parseKey('brand')).toEqual({ scope: 'brand', token: undefined, field: undefined, relative: false });
    expect(parseKey('brand.primary')).toEqual({ scope: 'brand', token: 'primary', field: undefined, relative: false });
    expect(parseKey('type.title.fontSize')).toEqual({ scope: 'type', token: 'title', field: 'fontSize', relative: false });
    expect(parseKey('.')).toEqual({ scope: '', relative: true });
    expect(parseKey('.primary')).toEqual({ scope: '', token: 'primary', field: undefined, relative: true });
    expect(parseKey('.title.fontSize')).toEqual({ scope: '', token: 'title', field: 'fontSize', relative: true });
  });

  it('refuses empty parts and too many parts', () => {
    for (const bad of ['', 'a..b', 'a.', '..a', 'a.b.c.d', '.a.b.c', '.a.']) expect(parseKey(bad)).toBeNull();
  });

  it('splitKey and scopeOf are its shortcuts', () => {
    expect(splitKey('type.title.fontSize')).toEqual(['type', 'title.fontSize']);
    expect(splitKey('brand')).toBeNull();
    expect(splitKey('.primary')).toBeNull();
    expect(scopeOf('brand.primary')).toBe('brand');
  });
});

describe('ref', () => {
  it('refuses a malformed key when it is written', () => {
    for (const bad of ['a..b', 'a.', 'a.b.c.d']) expect(() => ref(bad)).toThrow(TokenError);
  });
});
