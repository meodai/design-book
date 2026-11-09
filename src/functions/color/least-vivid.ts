import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { converter } from 'culori';
import {
  createFunctionToken,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { collectScopeColors } from './scope-colors';
import { filterReadable, readableOnParts } from './readable';
import { picked } from '../picks';
import type { ReadableOnOptions } from './readable';
import { filterLightness, lightnessOption } from './lightness-range';
import type { LightnessRange } from './lightness-range';

const toOklch = converter('oklch');

/**
 * Returns the color from a scope with the lowest OKLCH chroma — the
 * perceptually "most muted" candidate. Mirror of `mostVivid`: same axis,
 * inverted. Useful for deriving subtle surfaces or low-emphasis text from a
 * curated palette without inventing a new color. Ties go to the first
 * candidate in scope order. Pass `readableOn` to rank only candidates
 * readable on a backdrop.
 */
export function leastVividImpl(
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  readableContrast?: number,
  lightness?: LightnessRange,
): string {
  const pool = filterLightness('leastVivid',
    filterReadable('leastVivid', collectScopeColors(scope, not), readableOn, readableContrast),
    lightness, scope.name);
  let bestHex: string | null = null;
  let bestKey = '';
  let bestChroma = Infinity;

  for (const candidate of pool) {
    const chroma = toOklch(candidate.parsed)?.c;
    if (typeof chroma !== 'number') continue;
    if (chroma < bestChroma) {
      bestChroma = chroma;
      bestHex = candidate.hex;
      bestKey = candidate.key;
    }
  }

  if (!bestHex) {
    throw new FunctionError(
      'leastVivid: no valid color candidates found in scope',
      'leastVivid',
    );
  }

  return picked(scope, bestKey, bestHex);
}

export interface LeastVividOptions extends ReadableOnOptions {
  /** Keys to exclude from the candidate pool. Pass `ref('scope.token')`
   *  or a literal `'scope.token'` string. */
  not?: ReadonlyArray<string | ReferenceValue>;
  /** Only members whose OKLCH lightness lies in `[min, max]` (0 to 1):
   *  near black and white no color carries much chroma, so compare the
   *  colors of the band you mean. */
  lightness?: LightnessRange;
  description?: string;
  [key: string]: unknown;
}

export function leastVivid(pool: PoolArg, options?: LeastVividOptions): FunctionTokenValue {
  const scope = poolArg('leastVivid', pool);
  const readable = readableOnParts('leastVivid', options);
  const lightness = lightnessOption('leastVivid', options?.lightness);

  return createFunctionToken('leastVivid', [scope, ...readable.args], {
    description: options?.description,
    options: { not: normalizeNotKeys(options?.not), ...(lightness ? { lightness } : {}), ...readable.options },
    metadata: {
      dependencies: readable.dependencies,
      returnType: 'color',
    },
  });
}
