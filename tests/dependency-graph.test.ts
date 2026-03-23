import { describe, it, expect } from 'vitest';
import { DependencyGraph } from '../src/dependency-graph';

describe('DependencyGraph', () => {
  it('getPrerequisitesFor returns incoming edges', () => {
    const dg = new DependencyGraph();
    dg.addNode('a');
    dg.addNode('b');
    dg.addEdge('a', 'b');
    expect(dg.getPrerequisitesFor('b')).toContain('a');
  });

  it('getDependentsOf returns outgoing edges', () => {
    const dg = new DependencyGraph();
    dg.addNode('a');
    dg.addNode('b');
    dg.addEdge('a', 'b');
    expect(dg.getDependentsOf('a')).toContain('b');
  });

  it('getEvaluationOrderFor returns topologically sorted upstream', () => {
    const dg = new DependencyGraph();
    dg.addNode('a');
    dg.addNode('b');
    dg.addNode('c');
    dg.addEdge('a', 'b');
    dg.addEdge('b', 'c');
    const order = dg.getEvaluationOrderFor('c');
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  describe('updateEdges', () => {
    it('replaces all incoming edges for a key', () => {
      const dg = new DependencyGraph();
      dg.addNode('a');
      dg.addNode('b');
      dg.addNode('c');
      dg.addNode('target');
      dg.addEdge('a', 'target');

      dg.updateEdges('target', ['b', 'c']);

      expect(dg.getPrerequisitesFor('target')).not.toContain('a');
      expect(dg.getPrerequisitesFor('target')).toContain('b');
      expect(dg.getPrerequisitesFor('target')).toContain('c');
    });

    it('throws CircularDependencyError if new edges create a cycle', () => {
      const dg = new DependencyGraph();
      dg.addNode('a');
      dg.addNode('b');
      dg.addEdge('a', 'b'); // a is prerequisite of b

      // updateEdges('a', ['b']) means "a depends on b" — creates cycle a→b and b→a
      expect(() => dg.updateEdges('a', ['b'])).toThrow('Circular dependency');
    });

    it('does not modify graph when cycle is detected', () => {
      const dg = new DependencyGraph();
      dg.addNode('a');
      dg.addNode('b');
      dg.addEdge('a', 'b');

      const prereqsBefore = [...dg.getPrerequisitesFor('a')];
      try { dg.updateEdges('a', ['b']); } catch {}
      expect([...dg.getPrerequisitesFor('a')]).toEqual(prereqsBefore);
    });
  });
});
