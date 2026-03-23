import type { AnyTokenValue, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import { ReferenceResolver, BookLike } from './reference-resolver';

type BookWithScope = BookLike & {
  getScope(name: string): Scope | undefined;
  _notifyTokenChange(key: string, newValue: any, oldValue: any): void;
};

export class Scope {
  readonly name: string;
  readonly description?: string;
  private extendsName?: string;
  private tokens: Map<string, AnyTokenValue>;
  private referenceResolver: ReferenceResolver;
  private book: BookWithScope;

  constructor(
    name: string,
    book: BookWithScope,
    options?: { extends?: string; description?: string }
  ) {
    this.name = name;
    this.book = book;
    this.description = options?.description;
    this.extendsName = options?.extends;
    this.tokens = new Map();
    this.referenceResolver = new ReferenceResolver(book);
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
      const fn = token as FunctionTokenValue;
      const resolvedArgs = fn.args.map((arg: any) => {
        if (typeof arg === 'object' && arg !== null && arg.type === 'reference') {
          return this.book.resolve((arg as ReferenceValue).key);
        }
        if (typeof arg === 'object' && arg !== null && 'rawValue' in arg) {
          const tv = arg as TokenValue;
          if (tv.metadata?.unit) return `${tv.rawValue}${tv.metadata.unit}`;
          return String(tv.rawValue);
        }
        return arg;
      });
      return fn.implementation(...resolvedArgs);
    }

    const tv = token as TokenValue;
    if (tv.metadata?.unit) {
      return `${tv.rawValue}${tv.metadata.unit}`;
    }

    return String(tv.rawValue);
  }
}
