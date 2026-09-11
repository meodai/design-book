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

  /** Replace every incoming edge of `key`.
   *
   *  `dependencies` are hard prerequisites: if they would close a cycle the
   *  whole update is rolled back and a `CircularDependencyError` is thrown.
   *
   *  `optionalDependencies` are soft prerequisites — the live membership of a
   *  scope iterated by a function token. Two selectors that sit in each
   *  other's candidate pool legitimately form a cycle there (resolution
   *  breaks it with a re-entrancy guard), so a soft edge that would close a
   *  cycle is simply dropped instead of rejecting the change. */
  updateEdges(key: string, dependencies: string[], optionalDependencies: string[] = []): void {
    // Save current incoming edges for rollback
    const currentPrereqs = [...this.getIncoming(key)];

    // Remove all current incoming edges
    for (const prereq of currentPrereqs) {
      this.removeEdge(prereq, key);
    }

    // Add new incoming edges (auto-create nodes if needed)
    const existingNodes = new Set(this.getAllNodes());
    for (const dep of dependencies) {
      if (!existingNodes.has(dep)) {
        this.addNode(dep);
      }
      this.addEdge(dep, key);
    }

    // Check for cycles — if found, rollback
    if (this.hasCycles()) {
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

    this.addOptionalEdges(key, optionalDependencies, new Set(dependencies));
  }

  private addOptionalEdges(key: string, optionalDependencies: string[], hard: Set<string>): void {
    const optional = Array.from(new Set(optionalDependencies)).filter(
      dep => dep !== key && !hard.has(dep),
    );
    if (optional.length === 0) return;

    for (const dep of optional) {
      this.addEdge(dep, key);
    }
    if (!this.hasCycles()) return;

    // At least one soft edge closes a cycle — re-add them one by one and keep
    // only the ones that don't.
    for (const dep of optional) {
      this.removeEdge(dep, key);
    }
    for (const dep of optional) {
      this.addEdge(dep, key);
      if (this.hasCycles()) this.removeEdge(dep, key);
    }
  }
}
