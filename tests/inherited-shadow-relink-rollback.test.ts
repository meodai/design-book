import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

/** gp ← parent ← {c1, c2}; o reads both children's inherited `a`. Writing
 *  `parent.a = ref('o.x')` re-points c1.a and c2.a at parent.a; the second
 *  re-point closes a cycle (parent.a → c2.a → o.x → parent.a). */
function setup(mode: 'auto' | 'batch') {
  const book = new DesignBook('test');
  book.addScope('gp').set('a', color('red'));
  const parent = book.addScope('parent', { extends: 'gp' });
  book.addScope('c1', { extends: 'parent' });
  book.addScope('c2', { extends: 'parent' });
  const o = book.addScope('o');
  o.set('y', ref('c1.a'));
  o.set('x', ref('c2.a'));
  book.mode = mode;
  return { book, parent, graph: book.getDependencyGraph() };
}

describe('a new key whose inherited shadows cannot all be re-pointed', () => {
  it('auto: restores the shadows it had already re-pointed', () => {
    const { book, parent, graph } = setup('auto');
    expect(() => parent.set('a', ref('o.x'))).toThrow(CircularDependencyError);

    expect(graph.getIncoming('c1.a')).toEqual(['gp.a']);
    expect(graph.getIncoming('c2.a')).toEqual(['gp.a']);
    expect(book.resolve('o.y')).toBe('red');
  });

  it('batch: restores the shadows it had already re-pointed', () => {
    const { book, parent, graph } = setup('batch');
    parent.set('a', ref('o.x'));
    const { errors } = book.flush();

    expect(errors[0]).toBeInstanceOf(CircularDependencyError);
    expect(graph.getIncoming('c1.a')).toEqual(['gp.a']);
    expect(graph.getIncoming('c2.a')).toEqual(['gp.a']);
  });
});
