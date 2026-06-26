// tests/scope-order-invalidation.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { px, ref } from '../src/tokens';

describe('ordered-scope cache invalidation', () => {
  it('recomputes after a local set', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space');
    s.set('a', px(8)); s.set('b', px(4));
    s.setOrder([{ by: 'value' }]);
    expect(s.getAllKeys()).toEqual(['b', 'a']);
    s.set('c', px(1));                       // new smallest
    expect(s.getAllKeys()).toEqual(['c', 'b', 'a']);
  });

  it('recomputes after a local delete', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space');
    s.set('a', px(8)); s.set('b', px(4));
    s.setOrder([{ by: 'value' }]);
    expect(s.getAllKeys()).toEqual(['b', 'a']);
    s.delete('b');
    expect(s.getAllKeys()).toEqual(['a']);
  });

  it('reorders when a referenced token in another scope changes (value order)', () => {
    const book = new DesignBook('test');
    const src = book.addScope('src');
    src.set('x', px(8));
    const ui = book.addScope('ui');
    ui.set('big', px(100));
    ui.set('mirror', ref('src.x'));          // resolves to 8px
    ui.setOrder([{ by: 'value' }]);
    expect(ui.getAllKeys()).toEqual(['mirror', 'big']); // 8 < 100
    src.set('x', px(200));                    // mirror now 200 > 100
    expect(ui.getAllKeys()).toEqual(['big', 'mirror']);
  });

  it('changing a parent order reorders an unset child', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.set('a', px(8)); parent.set('b', px(4));
    const child = book.addScope('child', { extends: 'parent' });
    parent.setOrder([{ by: 'value' }]);
    expect(child.getAllKeys()).toEqual(['b', 'a']);
    parent.setOrder([{ by: 'value', direction: 'desc' }]);
    expect(child.getAllKeys()).toEqual(['a', 'b']);
  });
});
