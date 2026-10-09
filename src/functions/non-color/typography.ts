import { createFunctionToken, extractDependencies, isFunctionTokenValue, isReferenceValue } from '../../tokens';
import type { AnyTokenValue, FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { VALID_TOKEN_KEY } from '../../keys';

export type TypographyField = TokenValue | ReferenceValue | FunctionTokenValue | string | number;
export type TypographyFields = Record<string, TypographyField>;
/** `withFields` overrides: a value replaces or adds a field, `null` drops it. */
export type TypographyOverrides = Record<string, TypographyField | null>;

/** What the typography helpers need from a book. */
export interface TypographyBook {
  resolve(key: string): string;
  getTokenByKey(key: string): AnyTokenValue | undefined;
}

interface TypographyOptions {
  /** Names of the token's own fields, one per arg. */
  fields: string[];
  /** A live variant's base, `scope.token`: fields it doesn't set read the base's. */
  base?: string;
  /** Fields of the base the variant drops. */
  removed?: string[];
}

/** fontSize → font-size */
const toKebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const isTokenKey = (key: string) => key.split('.').length === 2;

function assertFieldNames(names: string[], fn: string): void {
  for (const name of names) {
    if (!VALID_TOKEN_KEY.test(name)) {
      throw new FunctionError(`${fn}: field "${name}" may only contain letters, digits, "-" and "_"`, fn);
    }
  }
}

function build(fields: TypographyFields, options: Omit<TypographyOptions, 'fields'>, description?: string): FunctionTokenValue {
  const names = Object.keys(fields);
  const args = names.map((name) => fields[name]);
  const opts: TypographyOptions = { fields: names };
  if (options.base) opts.base = options.base;
  if (options.removed?.length) opts.removed = options.removed;
  return createFunctionToken('typography', args, {
    description,
    options: opts,
    metadata: {
      dependencies: [...extractDependencies(args), ...(options.base ? [options.base] : [])],
      visualDependencies: [],
      returnType: 'typography',
    },
  });
}

/**
 * A text style as one token — the W3 `typography` composite. Each field
 * (`fontFamily`, `fontSize`, `lineHeight`, …; any key is allowed) is an
 * argument, so the refs it holds are graph dependencies like any function's,
 * a `ref()` to the token carries the whole style, and `ref('scope.token.field')`
 * reads one field. It resolves to its CSS declarations
 * (`font-size: 2rem; line-height: 1.5`); the css-variables renderer writes one
 * variable per field plus a class.
 */
export function typography(
  fields: TypographyFields,
  options?: { description?: string },
): FunctionTokenValue {
  const names = Object.keys(fields);
  if (names.length === 0) {
    throw new FunctionError('typography: needs at least one field', 'typography');
  }
  assertFieldNames(names, 'typography');
  return build(fields, {}, options?.description);
}

export function isTypographyToken(token: unknown): token is FunctionTokenValue {
  return isFunctionTokenValue(token) && token.name === 'typography';
}

function optionsOf(token: FunctionTokenValue): TypographyOptions {
  return (token.options ?? { fields: [] }) as TypographyOptions;
}

/** A typography token's own fields, by name (a variant's inherited ones are
 *  not included — see `typographyFieldNames`). */
export function typographyFields(token: FunctionTokenValue): TypographyFields {
  const { fields } = optionsOf(token);
  return Object.fromEntries(fields.map((name, i) => [name, token.args[i] as TypographyField]));
}

/** What one field of the typography `token` reads, for the graph: the
 *  refs in its own value, a variant's base field, or — for a field it does
 *  not have — `undefined`. */
export function typographyFieldDependencies(token: AnyTokenValue | undefined, field: string): string[] | undefined {
  if (isReferenceValue(token)) return isTokenKey(token.key) ? [`${token.key}.${field}`] : undefined;
  if (!isTypographyToken(token)) return undefined;
  const { fields, base, removed = [] } = optionsOf(token);
  const own = fields.indexOf(field);
  if (own !== -1) return extractDependencies([token.args[own]]);
  if (base && !removed.includes(field)) return [`${base}.${field}`];
  return undefined;
}

/** The base key of a live variant, or `undefined`. */
export function typographyBase(token: FunctionTokenValue): string | undefined {
  return optionsOf(token).base;
}

/** Every field name of the typography `token` holds — following refs and a
 *  variant's base, in base order with the variant's new fields after — or
 *  `undefined` when it is not a typography. */
export function typographyFieldNames(
  book: Pick<TypographyBook, 'getTokenByKey'>,
  token: AnyTokenValue | undefined,
  seen: Set<string> = new Set(),
): string[] | undefined {
  while (isReferenceValue(token)) {
    if (!isTokenKey(token.key) || seen.has(token.key)) return undefined;
    seen.add(token.key);
    token = book.getTokenByKey(token.key);
  }
  if (!isTypographyToken(token)) return undefined;
  const { fields, base, removed = [] } = optionsOf(token);
  if (!base) return [...fields];
  if (seen.has(base)) return undefined;
  seen.add(base);
  // A variant whose base is gone (or no typography) has no field list.
  const inherited = typographyFieldNames(book, book.getTokenByKey(base), seen);
  if (!inherited) return undefined;
  return [...inherited, ...fields.filter((f) => !inherited.includes(f))].filter((f) => !removed.includes(f));
}

/** The resolved typography: one CSS declaration per field. A variant reads
 *  the fields it doesn't set from its base. */
export function typographyImpl(book: TypographyBook, ...args: unknown[]): string {
  const { fields, base, removed = [] } = args.pop() as TypographyOptions;
  if (!base) return fields.map((field, i) => `${toKebab(field)}: ${String(args[i])}`).join('; ');

  const inherited = typographyFieldNames(book, book.getTokenByKey(base));
  if (!inherited) {
    throw new FunctionError(`typography: the base "${base}" is not a typography`, 'typography');
  }
  const names = [...inherited, ...fields.filter((f) => !inherited.includes(f))].filter((f) => !removed.includes(f));
  return names.map((field) => {
    const own = fields.indexOf(field);
    const value = own === -1 ? book.resolve(`${base}.${field}`) : String(args[own]);
    return `${toKebab(field)}: ${value}`;
  }).join('; ');
}

/**
 * Change some fields of a typography. Pass a **token** to get a copy — how a
 * theme or breakpoint layer changes a style in place, since a token cannot
 * `ref()` the value it replaces. Pass a **ref** to get a live variant: the
 * fields it doesn't set keep reading the base, so it follows every later
 * change to it. A `null` override drops a field.
 */
export function withFields(
  token: AnyTokenValue | undefined,
  overrides: TypographyOverrides,
): FunctionTokenValue {
  const set: TypographyFields = {};
  const dropped: string[] = [];
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) dropped.push(name);
    else set[name] = value;
  }
  assertFieldNames(Object.keys(overrides), 'withFields');

  if (isReferenceValue(token)) {
    if (!isTokenKey(token.key)) {
      throw new FunctionError(`withFields: the base must be a "scope.token" key, got "${token.key}"`, 'withFields');
    }
    return build(set, { base: token.key, removed: dropped });
  }
  if (!isTypographyToken(token)) {
    throw new FunctionError('withFields: expects a typography() token or a ref() to one', 'withFields');
  }

  const own = typographyFields(token);
  for (const name of dropped) delete own[name];
  const { base, removed = [] } = optionsOf(token);
  const nextRemoved = base
    ? [...removed.filter((f) => !(f in set)), ...dropped.filter((f) => !removed.includes(f))]
    : [];
  const merged = { ...own, ...set };
  if (!base && Object.keys(merged).length === 0) {
    throw new FunctionError('withFields: a typography needs at least one field', 'withFields');
  }
  return build(merged, { base, removed: nextRemoved }, token.description);
}
