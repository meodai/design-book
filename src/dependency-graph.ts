import { Graph } from './graph';
import { CircularDependencyError } from './errors';

export class DependencyGraph extends Graph {
  getPrerequisitesFor(key: string): string[] {
    return [...this.getIncoming(key)];
  }

  getDependentsOf(key: string): string[] {
    return [...this.getOutgoing(key)];
  }

  getEvaluationOrderFor(key: string): string[] {
    const upstream = this.dfsTraversal(key, true);
    return this.topologicalSort(upstream);
  }

  /** Replace every incoming edge of `key` with the given prerequisites. If
   *  they would close a cycle the whole update is rolled back and a
   *  `CircularDependencyError` is thrown.
   *
   *  Only value dependencies belong here. The candidate pool of a
   *  scope-iterating function token is deliberately *not* a graph edge —
   *  the book keeps it in a selector index instead — so a pool member that
   *  is derived from the selector iterating it is not a cycle. */
  /** True when `targets` contains `start` or a node downstream of it. */
  private reachesAny(start: string, targets: string[]): boolean {
    if (targets.length === 0) return false;
    const wanted = new Set(targets);
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (wanted.has(node)) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const next of this.getOutgoing(node)) if (!seen.has(next)) stack.push(next);
    }
    return false;
  }

  updateEdges(key: string, dependencies: string[]): void {
    // Save current incoming edges for rollback
    const currentPrereqs = [...this.getIncoming(key)];

    // Remove all current incoming edges
    for (const prereq of currentPrereqs) {
      this.removeEdge(prereq, key);
    }

    // Add new incoming edges (auto-create nodes if needed)
    for (const dep of dependencies) {
      if (!this.hasNode(dep)) {
        this.addNode(dep);
      }
      this.addEdge(dep, key);
    }

    // Check for cycles — if found, rollback. The graph was acyclic before
    // this call, so a cycle must run through one of the new edges
    // `dep → key`, i.e. `key` already reaches `dep`: a search downstream
    // from `key` answers it without walking the whole graph.
    if (this.reachesAny(key, dependencies)) {
      // Rollback: remove new edges
      for (const dep of dependencies) {
        this.removeEdge(dep, key);
      }
      // Restore old edges
      for (const prereq of currentPrereqs) {
        this.addEdge(prereq, key);
      }
      throw new CircularDependencyError([...dependencies, key]);
    }
  }
}
