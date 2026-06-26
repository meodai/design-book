import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color } from '../src/tokens';
import { nth } from '../src/functions/generic/nth';

describe('ordering ↔ resolution re-entrancy', () => {
  it('a value-ordered scope containing an nth() token resolves without recursion', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('white', color('#ffffff'));
    s.set('black', color('#000000'));
    s.set('pick', nth(s, 0)); // selector that walks getAllKeys()
    s.setOrder([{ by: 'value' }]);

    expect(() => s.getAllKeys()).not.toThrow();
    expect(() => book.resolve('s.pick')).not.toThrow();
  });
});
