import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { px } from '../src/tokens';
import { TokenError } from '../src/errors';

describe('token key validation', () => {
  function scope() {
    return new DesignBook('test').addScope('c');
  }

  it.each([
    'my key', ' lead', 'tab\there', '', 'a.b', '$value', 'x{y', 'x}y',
    'a:b', 'a;b', 'a(b)', 'a,b', 'a/b', 'a#b', 'a"b', "a'b", 'a\\b', 'a!b',
  ])('rejects %j', (key) => {
    const s = scope();
    expect(() => s.set(key, px(1))).toThrow(TokenError);
    expect(s.hasOwn(key)).toBe(false);
  });

  it('names the offending key in the error', () => {
    expect(() => scope().set('my key', px(1))).toThrow(/"my key"/);
  });

  it.each([
    's100', 'surface-hover', 'g100', '100', 'fontSize', 'font_size', 'primary-500', '-x', 'größe',
  ])('accepts %j', (key) => {
    const s = scope();
    s.set(key, px(1));
    expect(s.hasOwn(key)).toBe(true);
  });
});
