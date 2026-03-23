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

  updateEdges(key: string, dependencies: string[]): void {
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
  }
}
