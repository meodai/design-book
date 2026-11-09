import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';

describe('deleting a scope in batch mode', () => {
  it('leaves references into it unresolvable once flushed', () => {
    const book = new DesignBook('test');
    book.addScope('g').set('a', color('#ff0000'));
    book.addScope('o').set('x', ref('g.a'));
    expect(book.resolve('o.x')).toBe('#ff0000');

    book.mode = 'batch';
    book.deleteScope('g');
    book.flush();

    expect(() => book.resolve('o.x')).toThrow();
  });
});
