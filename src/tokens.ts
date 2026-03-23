import { parse } from 'culori';

export interface TokenValue {
  type: string;
  rawValue: string | number;
  processors?: Array<{ name: string; instance: any }>;
  description?: string;
  metadata?: { unit?: string; colorSpace?: string; validated?: boolean; [key: string]: any };
}

export interface ReferenceValue {
  type: 'reference';
  key: string;
  description?: string;
  resolvedType?: string;
  resolvedMetadata?: {
    isResolvable?: boolean;
    lastResolvedAt?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}

export interface FunctionTokenValue {
  type: 'function';
  rawValue: string;
  implementation: (...args: any[]) => string;
  args: any[];
  processors?: Array<{ name: string; instance: any }>;
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

export function val<T>(value: T, options?: { description?: string; [key: string]: any }): T & { description?: string } {
  if (typeof value === 'object' && value !== null && options) {
    return { ...value, ...options };
  }
  return value as T & { description?: string };
}

export function color(value: string, options?: { description?: string; [key: string]: any }): TokenValue {
  const parsed = parse(value);
  if (!parsed) {
    throw new Error(`Invalid color: ${value}`);
  }
  return val({
    type: 'color',
    rawValue: value,
    processors: [{ name: 'culori', instance: parsed }],
    metadata: { colorSpace: 'srgb', validated: true },
  }, options);
}

/** @deprecated Use `color()` instead */
export const hex = color;

export function ref(key: string, options?: { description?: string; [key: string]: any }): ReferenceValue {
  return val({
    type: 'reference' as const,
    key,
    resolvedType: undefined,
    resolvedMetadata: { isResolvable: undefined, lastResolvedAt: undefined },
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
