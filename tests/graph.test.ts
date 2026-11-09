import { describe, it, expect } from 'vitest';
import { Graph } from '../src/graph';

describe('Graph', () => {
  describe('node and edge management', () => {
    it('adds and retrieves nodes', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      expect(g.getAllNodes()).toContain('a');
      expect(g.getAllNodes()).toContain('b');
    });

    it('adds edges and retrieves neighbors', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      expect(g.getOutgoing('a')).toContain('b');
      expect(g.getIncoming('b')).toContain('a');
    });

    it('removes a node and its edges', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      g.removeNode('a');
      expect(g.getAllNodes()).not.toContain('a');
      expect(g.getIncoming('b')).not.toContain('a');
    });

    it('removes a specific edge', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      g.removeEdge('a', 'b');
      expect(g.getOutgoing('a')).not.toContain('b');
    });
  });

  describe('dfsTraversal', () => {
    it('traverses downstream (outgoing)', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      const result = g.dfsTraversal('a');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('traverses upstream (incoming)', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      const result = g.dfsTraversal('c', true);
      expect(result).toEqual(['c', 'b', 'a']);
    });
  });

  describe('topologicalSort', () => {
    it('sorts nodes respecting dependencies', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      const sorted = g.topologicalSort();
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
    });

    it('throws CircularDependencyError on cycle', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      g.addEdge('b', 'a');
      expect(() => g.topologicalSort()).toThrow('Circular dependency');
    });

    it('sorts a subset of keys', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      const sorted = g.topologicalSort(['c', 'b']);
      expect(sorted).toEqual(['b', 'c']);
    });
  });

});
