import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, getReferenceResolution, ref } from '../src/tokens';

describe('deleting a scope in batch mode', () => {
  it('marks references into it unresolvable once flushed', () => {
    const book = new DesignBook('test');
    book.addScope('g').set('a', color('#ff0000'));
    const r = ref('g.a');
    book.addScope('o').set('x', r);
    expect(getReferenceResolution(r)?.isResolvable).toBe(true);

    book.mode = 'batch';
    book.deleteScope('g');
    book.flush();

    expect(getReferenceResolution(r)?.isResolvable).toBe(false);
  });
});
