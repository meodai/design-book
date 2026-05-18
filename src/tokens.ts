import { parse } from 'culori';

export interface TokenProcessor {
  name: string;
  instance: any;
}

export interface ReferenceResolution {
  resolvedType?: string;
  isResolvable?: boolean;
  lastResolvedAt?: number;
  errorMessage?: string;
}

export interface TokenValue {
  type: string;
  rawValue: string | number;
  description?: string;
  metadata?: { unit?: string; colorSpace?: string; validated?: boolean; [key: string]: any };
}

export interface ReferenceValue {
  type: 'reference';
  key: string;
  description?: string;
}

export interface ScopeFunctionArg {
  name: string;
  getAllKeys(): string[];
}

export type FunctionArg =
  | TokenValue
  | ReferenceValue
  | FunctionTokenValue
  | ScopeFunctionArg
  | string
  | number;

export function isReferenceValue(arg: unknown): arg is ReferenceValue {
  return typeof arg === 'object' && arg !== null && 'type' in arg && (arg as { type?: string }).type === 'reference';
}

export function isTokenValue(arg: unknown): arg is TokenValue {
  return typeof arg === 'object' && arg !== null && 'rawValue' in arg;
}

export function isFunctionTokenValue(arg: unknown): arg is FunctionTokenValue {
  return typeof arg === 'object' && arg !== null && 'type' in arg && (arg as { type?: string }).type === 'function';
}

export interface FunctionTokenValue {
  type: 'function';
  name: string;
  args: FunctionArg[];
  description?: string;
  options?: Record<string, any>;
  metadata?: {
    dependencies: string[];
    visualDependencies: string[];
    acceptedTypes?: string[][];
    returnType?: string;
    [key: string]: any;
  };
}

export type AnyTokenValue = TokenValue | ReferenceValue | FunctionTokenValue;

const tokenProcessors = new WeakMap<TokenValue, TokenProcessor[]>();
const referenceResolutions = new WeakMap<ReferenceValue, ReferenceResolution>();

export function val<T>(value: T, options?: { description?: string; [key: string]: any }): T & { description?: string } {
  if (typeof value === 'object' && value !== null && options) {
    return { ...value, ...options };
  }
  return value as T & { description?: string };
}

export function createFunctionToken(
  name: string,
  args: FunctionArg[],
  config?: {
    description?: string;
    options?: Record<string, any>;
    metadata?: FunctionTokenValue['metadata'];
    [key: string]: any;
  }
): FunctionTokenValue {
  const { options, metadata, ...rest } = config ?? {};
  return val(
    {
      type: 'function' as const,
      name,
      args,
      options,
      metadata,
    },
    rest,
  );
}

export function setTokenProcessors(token: TokenValue, processors: TokenProcessor[]): TokenValue {
  tokenProcessors.set(token, processors);
  return token;
}

export function getTokenProcessors(token: TokenValue): TokenProcessor[] | undefined {
  return tokenProcessors.get(token);
}

export function setReferenceResolution(ref: ReferenceValue, resolution: ReferenceResolution): void {
  referenceResolutions.set(ref, resolution);
}

export function clearReferenceResolution(ref: ReferenceValue): void {
  referenceResolutions.delete(ref);
}

export function getReferenceResolution(ref: ReferenceValue): ReferenceResolution | undefined {
  return referenceResolutions.get(ref);
}

export function color(value: string, options?: { description?: string; [key: string]: any }): TokenValue {
  const parsed = parse(value);
  if (!parsed) {
    throw new Error(`Invalid color: ${value}`);
  }
  const token = val({
    type: 'color',
    rawValue: value,
    metadata: { colorSpace: 'srgb', validated: true },
  }, options);
  return setTokenProcessors(token, [{ name: 'culori', instance: parsed }]);
}

export function ref(key: string, options?: { description?: string; [key: string]: any }): ReferenceValue {
  return val({
    type: 'reference' as const,
    key,
  }, options);
}

export function dimension(value: number, unit: string, options?: { description?: string; [key: string]: any }): TokenValue {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid dimension value: ${value}`);
  }
  return val({ type: 'dimension', rawValue: value, metadata: { unit, validated: true } }, options);
}

export function px(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return dimension(value, 'px', options);
}

export function rem(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return dimension(value, 'rem', options);
}

export function ms(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return dimension(value, 'ms', options);
}

export function string(value: string, options?: { description?: string; [key: string]: any }): TokenValue {
  if (typeof value !== 'string') {
    throw new Error(`Expected string, got ${typeof value}`);
  }
  return val({ type: 'string', rawValue: value }, options);
}

export function extractDependencies(args: FunctionArg[]): string[] {
  const deps: string[] = [];
  for (const arg of args) {
    if (isReferenceValue(arg)) {
      deps.push(arg.key);
    } else if (isFunctionTokenValue(arg)) {
      // Nested function token — its dependencies are transitively this
      // function's dependencies, so the graph propagates correctly.
      for (const dep of extractDependencies(arg.args)) deps.push(dep);
    }
  }
  return deps;
}

/** Normalises a `not` option into an array of fully-qualified token keys.
 *  Accepts strings (already qualified keys) or `ReferenceValue` objects
 *  produced by `ref('scope.token')`. Used by scope-iterating analysis
 *  functions (bestContrastWith, mostVivid, …) to exclude candidates from
 *  the search pool. */
export function normalizeNotKeys(not?: ReadonlyArray<string | ReferenceValue>): string[] {
  if (!not || not.length === 0) return [];
  return not.map((n) => (typeof n === 'string' ? n : (n as ReferenceValue).key));
}

export function extractVisualDependencies(args: FunctionArg[]): string[] {
  const deps: string[] = [];
  for (const arg of args) {
    if (isFunctionTokenValue(arg)) {
      // Nested function tokens can themselves iterate scopes (e.g. a
      // mostVivid call nested inside another function). Pull their visual
      // dependencies up too.
      for (const dep of extractVisualDependencies(arg.args)) deps.push(dep);
    } else if (typeof arg === 'object' && arg !== null && typeof (arg as ScopeFunctionArg).getAllKeys === 'function') {
      const scopeArg = arg as ScopeFunctionArg;
      for (const key of scopeArg.getAllKeys()) {
        deps.push(`${scopeArg.name}.${key}`);
      }
    }
  }
  return deps;
}
