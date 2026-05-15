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

  describe('getNodeDegree', () => {
    it('returns incoming and outgoing degree', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('a', 'c');
      g.addEdge('c', 'b');
      expect(g.getNodeDegree('a', false)).toBe(2); // outgoing
      expect(g.getNodeDegree('b', true)).toBe(2);  // incoming
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

  describe('bfsTraversal', () => {
    it('traverses in breadth-first order', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addNode('d');
      g.addEdge('a', 'b');
      g.addEdge('a', 'c');
      g.addEdge('b', 'd');
      const result = g.bfsTraversal('a');
      expect(result[0]).toBe('a');
      expect(result.indexOf('d')).toBeGreaterThan(result.indexOf('b'));
      expect(result.indexOf('d')).toBeGreaterThan(result.indexOf('c'));
    });
  });

  describe('hasCycles', () => {
    it('returns false for acyclic graph', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      expect(g.hasCycles()).toBe(false);
    });

    it('returns true for cyclic graph', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      g.addEdge('c', 'a');
      expect(g.hasCycles()).toBe(true);
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

  describe('findShortestPath', () => {
    it('finds shortest path between two nodes', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      expect(g.findShortestPath('a', 'c')).toEqual(['a', 'b', 'c']);
    });

    it('returns null when no path exists', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      expect(g.findShortestPath('a', 'b')).toBeNull();
    });
  });

  describe('hasPath', () => {
    it('returns true when path exists', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      expect(g.hasPath('a', 'b')).toBe(true);
    });

    it('returns false when no path exists', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      expect(g.hasPath('a', 'b')).toBe(false);
    });
  });

  describe('getAdjacencyList', () => {
    it('returns each node mapped to its outgoing neighbours', () => {
      const g = new Graph();
      g.addEdge('a', 'b');
      g.addEdge('a', 'c');
      g.addEdge('b', 'd');

      const list = g.getAdjacencyList();
      expect(list.a.sort()).toEqual(['b', 'c']);
      expect(list.b).toEqual(['d']);
      expect(list.c).toEqual([]);
      expect(list.d).toEqual([]);
    });

    it('returns incoming neighbours when upstream is true', () => {
      const g = new Graph();
      g.addEdge('a', 'b');
      g.addEdge('a', 'c');
      g.addEdge('b', 'd');

      const list = g.getAdjacencyList(true);
      expect(list.a).toEqual([]);
      expect(list.b).toEqual(['a']);
      expect(list.c).toEqual(['a']);
      expect(list.d).toEqual(['b']);
    });

    it('includes orphan nodes with empty arrays', () => {
      const g = new Graph();
      g.addNode('lonely');
      expect(g.getAdjacencyList()).toEqual({ lonely: [] });
    });
  });
});
