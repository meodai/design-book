import { describe, it, expect } from 'vitest';
import { parseKey, splitKey, scopeOf, rootScopeOf } from '../src/keys';
import { ref } from '../src/tokens';
import { TokenError } from '../src/errors';

describe('parseKey', () => {
  it('takes a path apart into the scope it belongs to and its name there', () => {
    expect(parseKey('brand')).toEqual({ scope: 'brand', relative: false });
    expect(parseKey('brand.primary')).toEqual({ scope: 'brand', token: 'primary', relative: false });
    // A member of a group: the key `fontSize` of the scope `type.title`.
    expect(parseKey('type.title.fontSize')).toEqual({ scope: 'type.title', token: 'fontSize', relative: false });
    expect(parseKey('a.b.c.d')).toEqual({ scope: 'a.b.c', token: 'd', relative: false });
    expect(parseKey('.')).toEqual({ scope: '', relative: true });
    expect(parseKey('.primary')).toEqual({ scope: '', token: 'primary', relative: true });
    expect(parseKey('.title.fontSize')).toEqual({ scope: '.title', token: 'fontSize', relative: true });
  });

  it('refuses empty parts', () => {
    for (const bad of ['', 'a..b', 'a.', '..a', '.a.', '.a..b']) expect(parseKey(bad)).toBeNull();
  });

  it('splitKey, scopeOf and rootScopeOf are its shortcuts', () => {
    expect(splitKey('type.title.fontSize')).toEqual(['type.title', 'fontSize']);
    expect(splitKey('brand')).toBeNull();
    expect(splitKey('.primary')).toBeNull();
    expect(scopeOf('brand.primary')).toBe('brand');
    expect(scopeOf('type.title.fontSize')).toBe('type.title');
    expect(rootScopeOf('type.title.fontSize')).toBe('type');
  });
});

describe('ref', () => {
  it('refuses a malformed key when it is written', () => {
    for (const bad of ['a..b', 'a.', '.a.']) expect(() => ref(bad)).toThrow(TokenError);
  });

  it('takes a path of any depth', () => {
    expect(ref('context.major.hover.bg').key).toBe('context.major.hover.bg');
  });
});
