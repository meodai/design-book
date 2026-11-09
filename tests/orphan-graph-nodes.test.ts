import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';

describe('graph nodes left with no token and no dependents are removed', () => {
  it('a missing key that is no longer referenced', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('y', ref('m.k'));
    expect(book.getDependencyGraph().hasNode('m.k')).toBe(true);

    a.set('y', color('#ff0000'));
    expect(book.getDependencyGraph().hasNode('m.k')).toBe(false);
  });

  it('a deleted key once its last dependent goes away', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('x', color('#ff0000'));
    a.set('y', ref('a.x'));
    a.delete('x');
    // Still a dangling prerequisite: a.y points at it.
    expect(book.getDependencyGraph().hasNode('a.x')).toBe(true);

    a.delete('y');
    expect(book.getDependencyGraph().hasNode('a.x')).toBe(false);
    expect(book.getDependencyGraph().getAllNodes()).toEqual([]);
  });

  it('an inherited key keeps its hop to the source while it exists, and loses it when it is gone', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.set('a', color('#ff0000'));
    book.addScope('child', { extends: 'parent' });
    const graph = book.getDependencyGraph();
    // Wired as soon as it exists, read or not.
    expect(graph.getDependentsOf('parent.a')).toEqual(['child.a']);

    const o = book.addScope('o');
    o.set('x', ref('child.a'));
    o.set('x', color('#00ff00'));
    expect(graph.getDependentsOf('parent.a')).toEqual(['child.a']);

    parent.delete('a');
    expect(graph.hasNode('child.a')).toBe(false);
    expect(graph.hasNode('parent.a')).toBe(false);
  });

  it('keys that still have a token keep their node', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('x', color('#ff0000'));
    a.set('y', ref('a.x'));
    a.set('y', color('#00ff00'));
    expect(book.getDependencyGraph().hasNode('a.x')).toBe(true);
  });

  it('in batch mode too', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const a = book.addScope('a');
    a.set('y', ref('m.k'));
    book.flush();
    expect(book.getDependencyGraph().hasNode('m.k')).toBe(true);

    a.set('y', color('#ff0000'));
    book.flush();
    expect(book.getDependencyGraph().hasNode('m.k')).toBe(false);
  });
});
