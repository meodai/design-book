import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';

describe('inherited keys are wired as soon as they exist', () => {
  it('a key appearing in a parent is wired in every scope below it', () => {
    const book = new DesignBook('t');
    const root = book.addScope('root');
    book.addScope('mid', { extends: 'root' });
    book.addScope('leaf', { extends: 'mid' });
    root.set('a', color('#ff0000'));
    const graph = book.getDependencyGraph();
    expect(graph.getPrerequisitesFor('mid.a')).toEqual(['root.a']);
    expect(graph.getPrerequisitesFor('leaf.a')).toEqual(['root.a']);
  });

  it('a middle scope taking the key over re-points the scopes below it, and back', () => {
    const book = new DesignBook('t');
    const root = book.addScope('root');
    const mid = book.addScope('mid', { extends: 'root' });
    book.addScope('leaf', { extends: 'mid' });
    root.set('a', color('#ff0000'));
    const seen: string[] = [];
    book.watch('leaf.a', (v) => seen.push(v!));

    mid.set('a', color('#00ff00'));
    const graph = book.getDependencyGraph();
    expect(graph.getPrerequisitesFor('leaf.a')).toEqual(['mid.a']);
    root.set('a', color('#0000ff')); // leaf.a no longer reads it
    mid.delete('a');
    expect(graph.getPrerequisitesFor('leaf.a')).toEqual(['root.a']);
    expect(seen).toEqual(['#00ff00', '#0000ff']);
  });

  it('a scope created under an existing one wires what it inherits', () => {
    const book = new DesignBook('t');
    book.addScope('root').set('a', color('#ff0000'));
    book.addScope('ui').set('x', ref('leaf.a')); // written before leaf exists
    book.addScope('leaf', { extends: 'root' });
    expect(book.getDependencyGraph().getPrerequisitesFor('leaf.a')).toEqual(['root.a']);
    const seen: string[] = [];
    book.watch('ui.x', (v) => seen.push(v!));
    book.getScope('root')!.set('a', color('#00ff00'));
    expect(seen).toEqual(['#00ff00']);
  });

  it('deleting the parent scope unwires what its children inherited', () => {
    const book = new DesignBook('t');
    book.addScope('root').set('a', color('#ff0000'));
    book.addScope('leaf', { extends: 'root' });
    book.deleteScope('root');
    expect(book.getDependencyGraph().hasNode('leaf.a')).toBe(false);
  });
});
