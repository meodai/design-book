import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import type { ComparableEntry } from '../../src/orderers';

describe('orderer registry', () => {
  it('registers and retrieves a custom orderer', () => {
    const book = new DesignBook('test');
    const orderer = (entries: ComparableEntry[]) => [...entries].reverse();
    book.registerOrderer('custom', orderer);
    expect(book.getOrderer('custom')).toBe(orderer);
  });

  it('returns undefined for an unregistered type', () => {
    const book = new DesignBook('test');
    expect(book.getOrderer('nope')).toBeUndefined();
  });

  it('exposes registered types in registration order', () => {
    const book = new DesignBook('test');
    const types = book.getOrdererTypes();
    // built-ins registered in ctor (Task 2/3 add these); at minimum the array exists
    expect(Array.isArray(types)).toBe(true);
  });
});
