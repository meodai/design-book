import type { ReferenceValue, FunctionTokenValue } from './tokens';

export interface BookLike {
  resolve(key: string): string;
  getTokenByKey(key: string): any;
  getDependencyGraph(): { getDependentsOf(key: string): string[] };
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
      ref.resolvedType = token?.type;
      ref.resolvedMetadata = {
        isResolvable: true,
        lastResolvedAt: Date.now(),
        errorMessage: undefined,
      };
    } catch (error: any) {
      ref.resolvedType = undefined;
      ref.resolvedMetadata = {
        isResolvable: false,
        lastResolvedAt: Date.now(),
        errorMessage: error.message,
      };
    }
  }

  updateAllReferencesTo(key: string): void {
    const dependents = this.book.getDependencyGraph().getDependentsOf(key);
    for (const depKey of dependents) {
      const token = this.book.getTokenByKey(depKey);
      if (!token) continue;

      if (token.type === 'reference') {
        this.updateReferenceMetadata(token as ReferenceValue);
      }

      if (token.type === 'function') {
        const fn = token as FunctionTokenValue;
        for (const arg of fn.args) {
          if (typeof arg === 'object' && arg !== null && arg.type === 'reference' && arg.key === key) {
            this.updateReferenceMetadata(arg as ReferenceValue);
          }
        }
      }
    }
  }

  getCachedType(ref: ReferenceValue): string | undefined {
    return ref.resolvedType;
  }

  isResolvable(ref: ReferenceValue): boolean {
    return ref.resolvedMetadata?.isResolvable ?? false;
  }
}
