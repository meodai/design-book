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

export interface FunctionTokenValue {
  type: 'function';
  name: string;
  args: any[];
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
  args: any[],
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

export function extractDependencies(args: any[]): string[] {
  const deps: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null && arg.type === 'reference') {
      deps.push(arg.key);
    }
  }
  return deps;
}

export function extractVisualDependencies(args: any[]): string[] {
  const deps: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null && typeof arg.getAllKeys === 'function') {
      for (const key of arg.getAllKeys()) {
        deps.push(key);
      }
    }
  }
  return deps;
}
