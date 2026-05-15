import { CircularDependencyError } from './errors';

export class Graph {
  private outgoing: Map<string, Set<string>> = new Map();
  private incoming: Map<string, Set<string>> = new Map();

  addNode(key: string): void {
    if (!this.outgoing.has(key)) {
      this.outgoing.set(key, new Set());
    }
    if (!this.incoming.has(key)) {
      this.incoming.set(key, new Set());
    }
  }

  addEdge(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    this.outgoing.get(from)!.add(to);
    this.incoming.get(to)!.add(from);
  }

  removeNode(key: string): void {
    // Remove all outgoing edges from this node
    const outs = this.outgoing.get(key);
    if (outs) {
      for (const to of outs) {
        this.incoming.get(to)?.delete(key);
      }
    }
    // Remove all incoming edges to this node
    const ins = this.incoming.get(key);
    if (ins) {
      for (const from of ins) {
        this.outgoing.get(from)?.delete(key);
      }
    }
    this.outgoing.delete(key);
    this.incoming.delete(key);
  }

  removeEdge(from: string, to: string): void {
    this.outgoing.get(from)?.delete(to);
    this.incoming.get(to)?.delete(from);
  }

  getOutgoing(key: string): string[] {
    return Array.from(this.outgoing.get(key) ?? []);
  }

  getIncoming(key: string): string[] {
    return Array.from(this.incoming.get(key) ?? []);
  }

  getAllNodes(): string[] {
    return Array.from(this.outgoing.keys());
  }

  getNodeDegree(node: string, incoming: boolean = false): number {
    if (incoming) {
      return this.incoming.get(node)?.size ?? 0;
    }
    return this.outgoing.get(node)?.size ?? 0;
  }

  dfsTraversal(start: string, upstream: boolean = false): string[] {
    const visited: string[] = [];
    const seen = new Set<string>();
    const stack: string[] = [start];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (seen.has(node)) continue;
      seen.add(node);
      visited.push(node);

      const neighbors = upstream
        ? this.getIncoming(node)
        : this.getOutgoing(node);

      // Push in reverse order so we process in original order (LIFO)
      for (let i = neighbors.length - 1; i >= 0; i--) {
        if (!seen.has(neighbors[i])) {
          stack.push(neighbors[i]);
        }
      }
    }

    return visited;
  }

  /** Return the graph as an adjacency list — each node mapped to the keys
   *  it points to. When `upstream` is true, each node maps to its
   *  prerequisites (incoming edges) instead. Useful for graph-analysis or
   *  custom visualisers that don't want to walk the outgoing/incoming maps
   *  by hand. */
  getAdjacencyList(upstream: boolean = false): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const node of this.getAllNodes()) {
      result[node] = upstream ? this.getIncoming(node) : this.getOutgoing(node);
    }
    return result;
  }

  bfsTraversal(start: string, upstream: boolean = false): string[] {
    const visited: string[] = [];
    const seen = new Set<string>();
    const queue: string[] = [start];
    seen.add(start);

    while (queue.length > 0) {
      const node = queue.shift()!;
      visited.push(node);

      const neighbors = upstream
        ? this.getIncoming(node)
        : this.getOutgoing(node);

      for (const neighbor of neighbors) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return visited;
  }

  hasCycles(): boolean {
    // Three-color DFS: 0=white(unvisited), 1=gray(in-stack), 2=black(done)
    const color = new Map<string, number>();
    for (const node of this.outgoing.keys()) {
      color.set(node, 0);
    }

    const dfs = (node: string): boolean => {
      color.set(node, 1); // gray
      for (const neighbor of this.getOutgoing(node)) {
        const c = color.get(neighbor) ?? 0;
        if (c === 1) return true; // back edge → cycle
        if (c === 0 && dfs(neighbor)) return true;
      }
      color.set(node, 2); // black
      return false;
    };

    for (const node of this.outgoing.keys()) {
      if ((color.get(node) ?? 0) === 0) {
        if (dfs(node)) return true;
      }
    }

    return false;
  }

  topologicalSort(keys?: string[]): string[] {
    // Kahn's algorithm
    const inDegree = new Map<string, number>();
    for (const node of this.outgoing.keys()) {
      inDegree.set(node, this.incoming.get(node)?.size ?? 0);
    }

    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const neighbor of this.getOutgoing(node)) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (sorted.length !== this.outgoing.size) {
      throw new CircularDependencyError(sorted);
    }

    if (keys) {
      const keySet = new Set(keys);
      return sorted.filter(node => keySet.has(node));
    }

    return sorted;
  }

  findShortestPath(from: string, to: string, upstream: boolean = false): string[] | null {
    if (!this.outgoing.has(from) || !this.outgoing.has(to)) return null;

    const parent = new Map<string, string | null>();
    parent.set(from, null);
    const queue: string[] = [from];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node === to) {
        // Reconstruct path
        const path: string[] = [];
        let current: string | null = to;
        while (current !== null) {
          path.unshift(current);
          current = parent.get(current) ?? null;
        }
        return path;
      }

      const neighbors = upstream
        ? this.getIncoming(node)
        : this.getOutgoing(node);

      for (const neighbor of neighbors) {
        if (!parent.has(neighbor)) {
          parent.set(neighbor, node);
          queue.push(neighbor);
        }
      }
    }

    return null;
  }

  hasPath(from: string, to: string, upstream: boolean = false): boolean {
    return this.findShortestPath(from, to, upstream) !== null;
  }
}
