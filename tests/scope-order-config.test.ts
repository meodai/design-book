import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';

describe('scope order config + inheritance', () => {
  it('getOrder returns the local order; getEffectiveOrder mirrors it when set', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    expect(s.getOrder()).toBeUndefined();
    s.setOrder([{ by: 'name' }]);
    expect(s.getOrder()).toEqual([{ by: 'name' }]);
    expect(s.getEffectiveOrder()).toEqual([{ by: 'name' }]);
  });

  it('a child with no local order inherits the parent effective order', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.setOrder([{ by: 'value', direction: 'desc' }]);
    const child = book.addScope('child', { extends: 'parent' });
    expect(child.getOrder()).toBeUndefined();               // nothing local
    expect(child.getEffectiveOrder()).toEqual([{ by: 'value', direction: 'desc' }]);
  });

  it('child setOrder overrides inherited order', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.setOrder([{ by: 'value' }]);
    const child = book.addScope('child', { extends: 'parent' });
    child.setOrder([{ by: 'name' }]);
    expect(child.getEffectiveOrder()).toEqual([{ by: 'name' }]);
  });

  it('clearOrder reverts to inherited; setOrder([]) forces no ordering', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.setOrder([{ by: 'value' }]);
    const child = book.addScope('child', { extends: 'parent' });

    child.setOrder([]);                                      // explicit "off"
    expect(child.getEffectiveOrder()).toEqual([]);          // not the parent's

    child.clearOrder();                                     // back to inherit
    expect(child.getEffectiveOrder()).toEqual([{ by: 'value' }]);
  });
});
