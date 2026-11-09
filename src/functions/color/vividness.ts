import { poolArg } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, toMembers } from '../../tokens';
import type { FunctionTokenValue, MemberReference, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { best, colorPool } from '../pool';
import { readableOnOptions } from './readable';
import type { ReadableOn, ReadableOnOptions } from './readable';
import { filterLightness, lightnessOption } from './lightness-range';
import type { LightnessRange } from './lightness-range';
import { picked } from '../picks';

/**
 * `mostVivid` / `leastVivid`: the color with the highest / lowest OKLCH
 * chroma. OKLCH chroma rather than HSL saturation, which conflates
 * lightness and saturation, so a pale blue and a vivid mid-blue can score
 * the same. Ties go to the first candidate in scope order. `readableOn`
 * ranks only candidates readable on a backdrop; `lightness` only those in
 * an OKLCH lightness band (near black and white no color carries much
 * chroma).
 */
type Vividness = 'mostVivid' | 'leastVivid';

/** The options as the implementation receives them. */
export interface VividnessInputs extends ReadableOn {
  /** Qualified member keys left out (the registry has read `not`). */
  not: string[];
  lightness?: LightnessRange;
}

function vividImpl(fn: Vividness, scope: Scope, options: VividnessInputs): string {
  const pool = filterLightness(fn, colorPool(fn, scope, options.not, options.readableOn, options.readableContrast), options.lightness, scope.name);
  const pick = best(pool, (c) => c.c, fn === 'mostVivid' ? 'max' : 'min');
  if (!pick) throw new FunctionError(`${fn}: no valid color candidates found in scope`, fn);
  return picked(scope, pick.key, pick.hex);
}

/** The most vivid color in `scope` (highest OKLCH chroma). */
export function mostVividImpl(scope: Scope, options: VividnessInputs): string {
  return vividImpl('mostVivid', scope, options);
}

/** The least vivid color in `scope` (lowest OKLCH chroma). */
export function leastVividImpl(scope: Scope, options: VividnessInputs): string {
  return vividImpl('leastVivid', scope, options);
}

export interface VividnessOptions extends ReadableOnOptions {
  /** Keys to exclude from the candidate pool: `ref('scope.token')` or a
   *  literal `'scope.token'` string. Useful for keeping role-loaded tokens
   *  like `values.error` out of accent-color picking. */
  not?: ReadonlyArray<string | ReferenceValue | MemberReference>;
  /** Only members whose OKLCH lightness lies in `[min, max]` (0 to 1). */
  lightness?: LightnessRange;
  description?: string;
}

function build(fn: Vividness, pool: PoolArg, options?: VividnessOptions): FunctionTokenValue {
  const scope = poolArg(fn, pool);
  const lightness = lightnessOption(fn, options?.lightness);
  return createFunctionToken(fn, [scope], {
    description: options?.description,
    options: { not: toMembers(options?.not), ...(lightness ? { lightness } : {}), ...readableOnOptions(fn, options) },
    metadata: { dependencies: [], returnType: 'color' },
  });
}

/** The most vivid color in `pool`: highest OKLCH chroma. */
export function mostVivid(pool: PoolArg, options?: VividnessOptions): FunctionTokenValue {
  return build('mostVivid', pool, options);
}

/** The least vivid (most muted) color in `pool`: lowest OKLCH chroma —
 *  for subtle surfaces or low-emphasis text out of a curated palette. */
export function leastVivid(pool: PoolArg, options?: VividnessOptions): FunctionTokenValue {
  return build('leastVivid', pool, options);
}
