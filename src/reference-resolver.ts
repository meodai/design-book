import {
  getReferenceResolution,
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

  updateAllReferencesTo(key: string, dependentKeys?: string[]): void {
    const seeds = dependentKeys ?? this.book.getDependencyGraph().getDependentsOf(key);
    const queue = seeds.map(dependent => ({ key: dependent, via: key }));
    const seen = new Set<string>([key]);

    while (queue.length > 0) {
      const { key: depKey, via } = queue.shift()!;
      if (seen.has(depKey)) continue;
      seen.add(depKey);

      // A key that resolves through `extends` owns no token of its own — it
      // is a hop on the way to the tokens that actually reference it, and
      // `getTokenByKey` hands back the *parent's* token rather than telling
      // us so. Walk past it, or a `ref('child.a')` would never hear about
      // `parent.a` changing or going away.
      const source = this.book.getSourceKey?.(depKey);
      const isInheritedHop = source !== undefined && source !== depKey;
      const token = isInheritedHop ? undefined : this.book.getTokenByKey(depKey);

      if (!token) {
        for (const next of this.book.getDependencyGraph().getDependentsOf(depKey)) {
          queue.push({ key: next, via: depKey });
        }
        continue;
      }

      if (token.type === 'reference') {
        this.updateReferenceMetadata(token as ReferenceValue);
      }

      if (token.type === 'function') {
        const fn = token as FunctionTokenValue;
        for (const arg of fn.args) {
          if (isReferenceValue(arg) && arg.key === via) {
            this.updateReferenceMetadata(arg as ReferenceValue);
          }
        }
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
