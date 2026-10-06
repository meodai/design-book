import {
  getReferenceResolution,
  isFunctionTokenValue,
  isReferenceValue,
  setReferenceResolution,
} from './tokens';
import type { ReferenceValue, FunctionTokenValue } from './tokens';

export interface BookLike {
  resolve(key: string): string;
  getTokenByKey(key: string): any;
  getDependencyGraph(): { getDependentsOf(key: string): string[] };
  /** Fully-qualified key of the token a key actually reads — different from
   *  the key itself when it resolves through `extends`. Optional so simple
   *  test doubles need not supply it. */
  getSourceKey?(key: string): string | undefined;
}

export class ReferenceResolver {
  private book: BookLike;

  constructor(book: BookLike) {
    this.book = book;
  }

  updateReferenceMetadata(ref: ReferenceValue): void {
    try {
      this.book.resolve(ref.key);
      const token = this.book.getTokenByKey(ref.key);
      setReferenceResolution(ref, {
        resolvedType: token?.type,
        isResolvable: true,
        lastResolvedAt: Date.now(),
        errorMessage: undefined,
      });
    } catch (error: any) {
      setReferenceResolution(ref, {
        resolvedType: undefined,
        isResolvable: false,
        lastResolvedAt: Date.now(),
        errorMessage: error.message,
      });
    }
  }

  /** Refresh every reference that reads `key`, directly or through a chain
   *  of other tokens: a reference's resolvability depends on the whole path
   *  to a value, so the walk carries on through every dependent rather than
   *  stopping at the first token that holds a reference. */
  updateAllReferencesTo(key: string, dependentKeys?: string[]): void {
    const graph = this.book.getDependencyGraph();
    const queue = [...(dependentKeys ?? graph.getDependentsOf(key))];
    const seen = new Set<string>([key]);

    while (queue.length > 0) {
      const depKey = queue.shift()!;
      if (seen.has(depKey)) continue;
      seen.add(depKey);
      for (const next of graph.getDependentsOf(depKey)) queue.push(next);

      // A key that resolves through `extends` owns no token of its own — it
      // is a hop on the way to the tokens that actually reference it, and
      // `getTokenByKey` hands back the *parent's* token rather than telling
      // us so. Walk past it, or a `ref('child.a')` would never hear about
      // `parent.a` changing or going away.
      const source = this.book.getSourceKey?.(depKey);
      if (source !== undefined && source !== depKey) continue;

      const token = this.book.getTokenByKey(depKey);
      if (isReferenceValue(token)) {
        this.updateReferenceMetadata(token);
      } else if (isFunctionTokenValue(token)) {
        this.updateFunctionArgs(token);
      }
    }
  }

  /** Refresh the reference arguments of a function token, nested function
   *  tokens included. */
  updateFunctionArgs(fn: FunctionTokenValue): void {
    for (const arg of fn.args) {
      if (isReferenceValue(arg)) {
        this.updateReferenceMetadata(arg);
      } else if (isFunctionTokenValue(arg)) {
        this.updateFunctionArgs(arg);
      }
    }
  }

  getCachedType(ref: ReferenceValue): string | undefined {
    return getReferenceResolution(ref)?.resolvedType;
  }

  isResolvable(ref: ReferenceValue): boolean {
    return getReferenceResolution(ref)?.isResolvable ?? false;
  }
}
