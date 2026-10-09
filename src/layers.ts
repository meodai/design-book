import { DesignBook } from './design-book';
import type { DesignBookOptions } from './design-book';
import { CircularDependencyError, LayerError } from './errors';
import { isFunctionTokenValue, isReferenceValue, isTokenValue } from './tokens';
import type { AnyTokenValue } from './tokens';

/** Sparse token data: scope name → token name → token. */
export type LayerData = Record<string, Record<string, AnyTokenValue>>;

/** A named, sparse set of changes to a book — a theme, a brand, a density.
 *  Compose a stack of them with `composeBook`; the last layer wins. */
export interface Layer {
  readonly name: string;
  apply(book: DesignBook): void;
}

/** Make a layer from a setup function (free to add scopes with `extends` /
 *  register functions, build selectors, delete tokens) or from
 *  data (`{ brand: { highlight: color('#3f8f5a') } }`). Data layers create
 *  missing scopes, accept tokens only, and clone them on every apply so
 *  books built from one layer never share token objects. */
export function layer(name: string, source: ((book: DesignBook) => void) | LayerData): Layer {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new LayerError('Layer name must be a non-empty string', String(name));
  }
  const apply = typeof source === 'function'
    ? (book: DesignBook) => source(book)
    : (book: DesignBook) => applyData(name, book, source);
  return Object.freeze({ name, apply });
}

function applyData(layerName: string, book: DesignBook, data: LayerData): void {
  for (const [scopeName, tokens] of Object.entries(data)) {
    const scope = book.getScope(scopeName) ?? book.addScope(scopeName);
    for (const [tokenName, value] of Object.entries(tokens)) {
      if (!isTokenValue(value) && !isReferenceValue(value) && !isFunctionTokenValue(value)) {
        const key = `${scopeName}.${tokenName}`;
        throw new LayerError(
          `Layer "${layerName}": "${key}" must be a token (color(), ref(), px(), string(), …) — got ${describe(value)}`,
          layerName,
          { tokenKey: key },
        );
      }
      scope.set(tokenName, cloneToken(value));
    }
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `the string ${JSON.stringify(value)}`;
  return typeof value;
}

/** Copy plain objects and arrays all the way down; anything else (a scope
 *  argument, which resolves by name in the target book anyway) is kept. */
function cloneToken<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneToken) as T;
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) copy[k] = cloneToken(v);
    return copy as T;
  }
  return value;
}

/** Which layer last wrote each key of a composed book. */
const provenance = new WeakMap<DesignBook, Map<string, string>>();

/** Build one book from an ordered stack of layers — base first, the most
 *  specific theme last. Each layer writes into the same book, so a root it
 *  overrides re-flows to every token that depends on it. The book is built
 *  in batch mode, flushed after each layer, then left in `options.mode`
 *  (default `auto`). */
export function composeBook(name: string, layers: readonly Layer[], options?: DesignBookOptions): DesignBook {
  if (layers.length === 0) {
    throw new LayerError(`composeBook "${name}": needs at least one layer`, '');
  }
  const names = new Set<string>();
  for (const l of layers) {
    if (names.has(l.name)) {
      throw new LayerError(`composeBook "${name}": layer "${l.name}" appears more than once`, l.name);
    }
    names.add(l.name);
  }

  const book = new DesignBook(name, { ...options, mode: 'batch' });
  const sources = new Map<string, string>();

  for (const l of layers) {
    const before = ownTokens(book);
    try {
      l.apply(book);
    } catch (e) {
      if (e instanceof LayerError) throw e;
      throw new LayerError(
        `Layer "${l.name}" failed: ${e instanceof Error ? e.message : String(e)}`,
        l.name,
        { tokenKey: (e as { tokenKey?: string })?.tokenKey, cause: e },
      );
    }

    const { errors } = book.flush();
    const cycle = errors.find((e): e is CircularDependencyError => e instanceof CircularDependencyError);
    if (cycle) {
      // updateEdges reports `[...dependencies, key]` — the rejected key is last.
      const key = cycle.path[cycle.path.length - 1];
      throw new LayerError(`Layer "${l.name}" closes a cycle at "${key}": ${cycle.message}`, l.name, {
        tokenKey: key,
        cause: cycle,
      });
    }

    const after = ownTokens(book);
    for (const [key, token] of after) {
      if (before.get(key) !== token) record(sources, key, l.name);
    }
    for (const key of before.keys()) {
      if (!after.has(key)) record(sources, key, l.name);
    }
  }

  provenance.set(book, sources);
  book.mode = options?.mode ?? 'auto';
  return book;
}

/** Re-insert so map order follows the latest write. */
function record(sources: Map<string, string>, key: string, layerName: string): void {
  sources.delete(key);
  sources.set(key, layerName);
}

function ownTokens(book: DesignBook): Map<string, AnyTokenValue> {
  const tokens = new Map<string, AnyTokenValue>();
  for (const scope of book.getAllScopes()) {
    for (const key of scope.ownKeys()) {
      tokens.set(`${scope.name}.${key}`, scope.get(key)!);
    }
  }
  return tokens;
}

/** The layer that last set or deleted `key` while `composeBook` built the
 *  book; `undefined` for keys no layer wrote and books it did not build.
 *  Writes made to the book afterwards are not tracked. */
export function layerOf(book: DesignBook, key: string): string | undefined {
  return provenance.get(book)?.get(key);
}

/** Keys whose last writer was `layerName`, in write order — what exactly a
 *  theme changes. */
export function keysFromLayer(book: DesignBook, layerName: string): string[] {
  const sources = provenance.get(book);
  if (!sources) return [];
  return [...sources].filter(([, name]) => name === layerName).map(([key]) => key);
}
