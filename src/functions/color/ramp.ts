import { valueArg, assertOptions } from '../args';
import { DittoTones } from 'dittotones';
import type { GenerateResult, Ramp } from 'dittotones';
import { converter, formatHex, parse } from 'culori';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

export interface RampEngineOptions {
  ramps: Map<string, Ramp>;
  preserveHueOffsets?: boolean;
  gamutMap?: boolean;
  /** LRU cache cap. Defaults to 32. */
  cacheSize?: number;
}

export class RampEngine {
  private dt: DittoTones;
  private cache = new Map<string, GenerateResult>();
  private cacheSize: number;

  constructor(opts: RampEngineOptions) {
    this.dt = new DittoTones({
      ramps: opts.ramps,
      preserveHueOffsets: opts.preserveHueOffsets ?? true,
      gamutMap: opts.gamutMap ?? true,
    });
    this.cacheSize = Math.max(1, opts.cacheSize ?? 32);
  }

  generate(seed: string): GenerateResult {
    const hit = this.cache.get(seed);
    if (hit) {
      // refresh LRU position
      this.cache.delete(seed);
      this.cache.set(seed, hit);
      return hit;
    }
    const result = this.dt.generate(seed);
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }
    this.cache.set(seed, result);
    return result;
  }
}

const toOklch = converter('oklch');

/** A set of master ramps, as dittotones takes them: name → shade → OKLCH. */
export type RampSet = Map<string, Ramp>;

/** Your own masters, in any CSS colors: `{ clay: { 100: '#f3e3d8', 500: '#b0603a' } }`. */
export type RampSetSource = RampSet | Record<string, Record<string | number, string>>;

/**
 * A set of master ramps for `ramp()` to copy: a framework's straight from
 * dittotones (`import { radixRamps } from 'dittotones/ramps/radix'`) or your
 * own, written in any CSS colors. At least two ramps, the more the better
 * (a seed is placed between the masters nearest to it), all of the same
 * length with the same shades in the same order (that order is the scale).
 * Register it with `book.registerRamps(name, set)`.
 */
export function rampSet(source: RampSetSource): RampSet {
  const set: RampSet = new Map();
  const entries = source instanceof Map ? [...source.entries()] : Object.entries(source);
  // dittotones places a seed between the masters nearest to it, so one
  // ramp gives it nothing to place between: at least two, and the more
  // the better.
  if (entries.length < 2) {
    throw new FunctionError(`rampSet: needs at least two ramps, got ${entries.length}`, 'ramp');
  }
  let shades: string[] | null = null;
  for (const [name, ramp] of entries) {
    if (!ramp || typeof ramp !== 'object') {
      throw new FunctionError(`rampSet: ramp "${name}" is not a shade → color record`, 'ramp');
    }
    const out: Ramp = {};
    for (const [shade, value] of Object.entries(ramp as Record<string, unknown>)) {
      const color = typeof value === 'string' ? toOklch(parse(value) as any) : value;
      if (!color || typeof color !== 'object' || (color as any).mode !== 'oklch') {
        throw new FunctionError(`rampSet: cannot read ${name}.${shade} (${String(value)}) as a color`, 'ramp');
      }
      out[shade] = color as Ramp[string];
    }
    const keys = Object.keys(out);
    if (keys.length < 2) {
      throw new FunctionError(`rampSet: ramp "${name}" needs at least two shades`, 'ramp');
    }
    if (shades && keys.length !== shades.length) {
      throw new FunctionError(`rampSet: ramp "${name}" has ${keys.length} shades, the others ${shades.length}; every ramp needs the same length`, 'ramp');
    }
    if (shades && keys.join() !== shades.join()) {
      throw new FunctionError(`rampSet: ramp "${name}" has the shades ${keys.join(', ')}, the others ${shades.join(', ')}; every ramp needs the same`, 'ramp');
    }
    shades ??= keys;
    set.set(name, out);
  }
  return set;
}

export function rampImpl(seedValue: string, shade: string, engine: RampEngine): string {
  let result;
  try {
    result = engine.generate(seedValue);
  } catch (err) {
    throw new FunctionError(
      `ramp: cannot generate scale from seed "${seedValue}": ${(err as Error).message}`,
      'ramp',
    );
  }
  const oklch = result.scale[shade];
  if (!oklch) {
    const known = Object.keys(result.scale).join(', ');
    throw new FunctionError(
      `ramp: unknown shade "${shade}", expected one of: ${known}`,
      'ramp',
    );
  }
  const hex = formatHex(oklch);
  if (!hex) {
    throw new FunctionError(`ramp: failed to format shade "${shade}" as hex`, 'ramp');
  }
  return hex;
}

/**
 * One shade of the scale dittotones builds from `seed` by copying a set of
 * master ramps: the book's default set, or the one named by `from`
 * (registered with `book.registerRamps`).
 */
export function ramp(
  seed: TokenValue | ReferenceValue | FunctionTokenValue,
  options: { shade: string; from?: string; description?: string },
): FunctionTokenValue {
  assertOptions('ramp', options, ['shade', 'from']);
  valueArg('ramp', seed);
  if (typeof options?.shade !== 'string' || options.shade.length === 0) {
    throw new FunctionError('ramp: "shade" option is required and must be a non-empty string', 'ramp');
  }
  if (options.from !== undefined && (typeof options.from !== 'string' || options.from.length === 0)) {
    throw new FunctionError('ramp: "from" is the name of a registered ramp set', 'ramp');
  }
  return createFunctionToken(
    'ramp',
    [seed],
    {
      description: options.description,
      options: { shade: options.shade, ...(options.from !== undefined ? { from: options.from } : {}) },
      metadata: {
        dependencies: extractDependencies([seed]),
        returnType: 'color',
      },
    },
  );
}

const DEFAULT_SHADES = ['50','100','200','300','400','500','600','700','800','900','950'] as const;

export function rampStops(
  seed: TokenValue | ReferenceValue | FunctionTokenValue,
  options: { prefix: string; shades?: ReadonlyArray<string>; from?: string; description?: string },
): Record<string, FunctionTokenValue> {
  assertOptions('rampStops', options, ['prefix', 'shades', 'from']);
  if (typeof options?.prefix !== 'string' || options.prefix.length === 0) {
    throw new FunctionError('rampStops: "prefix" option is required and must be a non-empty string', 'rampStops');
  }
  const shades = options.shades ?? DEFAULT_SHADES;
  const out: Record<string, FunctionTokenValue> = {};
  for (const shade of shades) {
    out[`${options.prefix}${shade}`] = ramp(seed, { shade, from: options.from, description: options.description });
  }
  return out;
}
