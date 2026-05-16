import { DittoTones } from 'dittotones';
import type { GenerateResult, Ramp } from 'dittotones';
import { formatHex } from 'culori';
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

export function ramp(
  seed: TokenValue | ReferenceValue | FunctionTokenValue,
  options: { shade: string; description?: string },
): FunctionTokenValue {
  if (typeof options?.shade !== 'string' || options.shade.length === 0) {
    throw new FunctionError('ramp: "shade" option is required and must be a non-empty string', 'ramp');
  }
  return createFunctionToken(
    'ramp',
    [seed],
    {
      description: options.description,
      options: { shade: options.shade },
      metadata: {
        dependencies: extractDependencies([seed]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
  );
}
