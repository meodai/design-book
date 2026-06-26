// tests/scope-order-sort.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px, string } from '../src/tokens';

describe('scope sort engine', () => {
  it('orders by name asc/desc; clearOrder reverts to insertion order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('c', string('x')); s.set('a', string('y')); s.set('b', string('z'));

    s.setOrder([{ by: 'name' }]);
    expect(s.getAllKeys()).toEqual(['a', 'b', 'c']);
    s.setOrder([{ by: 'name', direction: 'desc' }]);
    expect(s.getAllKeys()).toEqual(['c', 'b', 'a']);
    s.clearOrder();
    expect(s.getAllKeys()).toEqual(['c', 'a', 'b']); // insertion order
  });

  it('orders by value on a dimension scope (numeric)', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space');
    s.set('lg', px(16)); s.set('sm', px(4)); s.set('md', px(8));
    s.setOrder([{ by: 'value' }]);
    expect(s.getAllKeys()).toEqual(['sm', 'md', 'lg']);
  });

  it('type criterion groups by priority, value sorts within group, name breaks ties', () => {
    const book = new DesignBook('test');
    const s = book.addScope('mix');
    s.set('p16', px(16)); s.set('white', color('#ffffff'));
    s.set('p4', px(4));   s.set('black', color('#000000'));
    s.setOrder([
      { by: 'type', priority: ['color', 'dimension'] },
      { by: 'value' },
      { by: 'name' },
    ]);
    const keys = s.getAllKeys();
    // colors first (black before white by value), then dimensions (p4 before p16)
    expect(keys.slice(0, 2)).toEqual(['black', 'white']);
    expect(keys.slice(2)).toEqual(['p4', 'p16']);
  });

  it('value across differing types without a type criterion falls through to name', () => {
    const book = new DesignBook('test');
    const s = book.addScope('mix');
    s.set('z', px(4)); s.set('a', color('#000000'));
    s.setOrder([{ by: 'value' }, { by: 'name' }]); // cross-type value => 0 => name
    expect(s.getAllKeys()).toEqual(['a', 'z']);
  });

  it('unresolvable tokens sort last and getAllKeys does not throw', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('good', px(8));
    // a reference to a non-existent key is unresolvable
    s.set('bad', { type: 'reference', key: 's.missing' } as any);
    s.setOrder([{ by: 'value' }]);
    expect(() => s.getAllKeys()).not.toThrow();
    expect(s.getAllKeys()[s.getAllKeys().length - 1]).toBe('bad');
  });

  it('allTokens follows the ordered keys', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('b', string('y')); s.set('a', string('x'));
    s.setOrder([{ by: 'name' }]);
    expect(Object.keys(s.allTokens())).toEqual(['a', 'b']);
  });
});
