import { CircularDependencyError } from './errors';

const EMPTY: ReadonlySet<string> = new Set();

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

  hasNode(key: string): boolean {
    return this.outgoing.has(key);
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

  /** A copy of the nodes `key` points to; safe to keep or change. */
  getOutgoing(key: string): string[] {
    return Array.from(this.outgoing.get(key) ?? []);
  }

  /** A copy of the nodes pointing to `key`; safe to keep or change. */
  getIncoming(key: string): string[] {
    return Array.from(this.incoming.get(key) ?? []);
  }

  /** The nodes `key` points to, without copying: for walks that only read. */
  outgoingOf(key: string): ReadonlySet<string> {
    return this.outgoing.get(key) ?? EMPTY;
  }

  /** The nodes pointing to `key`, without copying: for walks that only read. */
  incomingOf(key: string): ReadonlySet<string> {
    return this.incoming.get(key) ?? EMPTY;
  }

  getAllNodes(): string[] {
    return Array.from(this.outgoing.keys());
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

    // The queue is read by index: shift() made the sort quadratic.
    const sorted: string[] = [];
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      sorted.push(node);
      for (const neighbor of this.outgoingOf(node)) {
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

}
