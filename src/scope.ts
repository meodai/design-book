import { isFunctionTokenValue, isReferenceValue, isTokenValue } from './tokens';
import type { AnyTokenValue, FunctionArg, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import type { FunctionImplementation } from './design-book';
import { ReferenceResolver, BookLike } from './reference-resolver';

type BookWithScope = BookLike & {
  getScope(name: string): Scope | undefined;
  getFunction(name: string): FunctionImplementation | undefined;
  _notifyTokenChange(key: string, newValue: any, oldValue: any): void;
};

export class Scope {
  readonly name: string;
  readonly description?: string;
  /** Stored compose marker; the public getter walks the extends chain. */
  private _compose?: string;
  private extendsName?: string;
  private tokens: Map<string, AnyTokenValue>;
  private referenceResolver: ReferenceResolver;
  private book: BookWithScope;

  constructor(
    name: string,
    book: BookWithScope,
    options?: { extends?: string; description?: string; compose?: string }
  ) {
    this.name = name;
    this.book = book;
    this.description = options?.description;
    this.extendsName = options?.extends;
    this._compose = options?.compose;
    this.tokens = new Map();
    this.referenceResolver = new ReferenceResolver(book);
  }

  /** Name of the scope this one extends, or `undefined` if it doesn't
   *  inherit from another scope. */
  get extendsScope(): string | undefined {
    return this.extendsName;
  }

  /** Optional marker that lets renderers re-aggregate the scope's tokens
   *  into a composite output (e.g. a CSS class for a typography style or
   *  a W3 `$type: 'typography'` token). Inherits through `extends` unless
   *  the scope sets its own marker. Returns `undefined` if no scope in
   *  the chain is composed. */
  get compose(): string | undefined {
    if (this._compose) return this._compose;
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.compose;
    }
    return undefined;
  }

  get(name: string): AnyTokenValue | undefined {
    if (this.tokens.has(name)) {
      return this.tokens.get(name);
    }
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.get(name);
    }
    return undefined;
  }

  getSourceKey(name: string): string | undefined {
    if (this.tokens.has(name)) {
      return `${this.name}.${name}`;
    }
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.getSourceKey(name);
    }
    return undefined;
  }

  isInherited(name: string): boolean {
    return this.has(name) && !this.hasOwn(name);
  }

  set(name: string, value: AnyTokenValue): void {
    const oldValue = this.tokens.get(name);
    this.tokens.set(name, value);
    this.book._notifyTokenChange(`${this.name}.${name}`, value, oldValue);
  }

  has(name: string): boolean {
    if (this.tokens.has(name)) return true;
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.has(name) ?? false;
    }
    return false;
  }

  /** Check if a key is defined locally (not inherited) */
  hasOwn(name: string): boolean {
    return this.tokens.has(name);
  }

  /** Delete a local token, reverting to inherited value if available */
  delete(name: string): boolean {
    const had = this.tokens.delete(name);
    if (had) {
      this.book._notifyTokenChange(`${this.name}.${name}`, undefined, undefined);
    }
    return had;
  }

  updateReferenceCaches(key: string, dependentKeys?: string[]): void {
    this.referenceResolver.updateAllReferencesTo(key, dependentKeys);
  }

  /** Resolve any fully-qualified token key (in this scope or another) by
   *  delegating to the owning book. Useful for selectors that need to
   *  cross-resolve `not` references during candidate iteration. */
  resolveKey(qualifiedKey: string): string {
    return this.book.resolve(qualifiedKey);
  }

  getAllKeys(): string[] {
    const localKeys = Array.from(this.tokens.keys());
    if (!this.extendsName) return localKeys;

    const parentKeys = this.book.getScope(this.extendsName)?.getAllKeys() ?? [];
    const combined = new Set([...parentKeys, ...localKeys]);
    return Array.from(combined);
  }

  allTokens(): Record<string, AnyTokenValue> {
    const result: Record<string, AnyTokenValue> = {};

    if (this.extendsName) {
      const parentTokens = this.book.getScope(this.extendsName)?.allTokens() ?? {};
      Object.assign(result, parentTokens);
    }

    for (const [key, value] of this.tokens) {
      result[key] = value;
    }

    return result;
  }

  resolve(name: string): string {
    const token = this.get(name);
    if (!token) {
      throw new Error(`Token "${name}" not found in scope "${this.name}"`);
    }

    if (token.type === 'reference') {
      const ref = token as ReferenceValue;
      return this.book.resolve(ref.key);
    }

    if (token.type === 'function') {
      return this.resolveFunctionToken(token as FunctionTokenValue);
    }

    const tv = token as TokenValue;
    if (tv.metadata?.unit) {
      return `${tv.rawValue}${tv.metadata.unit}`;
    }

    return String(tv.rawValue);
  }

  /** Resolve a function token, recursing into any nested function-token
   *  arguments. Function tokens don't live in a scope as named entries —
   *  they're inlined as args — so they're invoked directly through the
   *  book's function registry rather than via `book.resolve`. */
  private resolveFunctionToken(fn: FunctionTokenValue): string {
    const resolvedArgs = fn.args.map((arg: FunctionArg) => {
      if (isReferenceValue(arg)) {
        return this.book.resolve((arg as ReferenceValue).key);
      }
      if (isFunctionTokenValue(arg)) {
        return this.resolveFunctionToken(arg);
      }
      if (isTokenValue(arg)) {
        const tv = arg as TokenValue;
        if (tv.metadata?.unit) return `${tv.rawValue}${tv.metadata.unit}`;
        return String(tv.rawValue);
      }
      return arg;
    });
    const implementation = this.book.getFunction(fn.name);
    if (!implementation) {
      throw new Error(`Function "${fn.name}" is not registered`);
    }
    return implementation(...resolvedArgs, fn.options);
  }
}
