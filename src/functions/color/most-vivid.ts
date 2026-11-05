import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { converter } from 'culori';
import {
  createFunctionToken,
  extractVisualDependencies,
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
 * Returns the color from a scope with the highest OKLCH chroma — the
 * perceptually "most vivid" candidate. OKLCH chroma is the right axis here
 * because HSL saturation conflates lightness and saturation, so a pale blue
 * and a vivid mid-blue can score the same. Ties go to the first candidate in
 * scope order. Pass `readableOn` to rank only candidates readable on a
 * backdrop.
 */
export function mostVividImpl(
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  readableContrast?: number,
  lightness?: LightnessRange,
): string {
  const pool = filterLightness('mostVivid',
    filterReadable('mostVivid', collectScopeColors(scope, not), readableOn, readableContrast),
    lightness, scope.name);
  let bestHex: string | null = null;
  let bestKey = '';
  let bestChroma = -Infinity;

  for (const candidate of pool) {
    const chroma = toOklch(candidate.parsed)?.c;
    if (typeof chroma !== 'number') continue;
    if (chroma > bestChroma) {
      bestChroma = chroma;
      bestHex = candidate.hex;
      bestKey = candidate.key;
    }
  }

  if (!bestHex) {
    throw new FunctionError(
      'mostVivid: no valid color candidates found in scope',
      'mostVivid',
    );
  }

  return picked(scope, bestKey, bestHex);
}

export interface MostVividOptions extends ReadableOnOptions {
  /** Keys to exclude from the candidate pool. Pass `ref('scope.token')`
   *  or a literal `'scope.token'` string. Useful for keeping role-loaded
   *  tokens like `values.error` out of accent-color picking. */
  not?: ReadonlyArray<string | ReferenceValue>;
  /** Only members whose OKLCH lightness lies in `[min, max]` (0 to 1):
   *  near black and white no color carries much chroma, so compare the
   *  colors of the band you mean. */
  lightness?: LightnessRange;
  description?: string;
  [key: string]: unknown;
}

export function mostVivid(pool: PoolArg, options?: MostVividOptions): FunctionTokenValue {
  const scope = poolArg('mostVivid', pool);
  const readable = readableOnParts('mostVivid', options);
  const lightness = lightnessOption('mostVivid', options?.lightness);

  return createFunctionToken('mostVivid', [scope, ...readable.args], {
    description: options?.description,
    options: { not: normalizeNotKeys(options?.not), ...(lightness ? { lightness } : {}), ...readable.options },
    metadata: {
      dependencies: readable.dependencies,
      visualDependencies: extractVisualDependencies([scope, ...readable.args]),
      returnType: 'color',
    },
  });
}
