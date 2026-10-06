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
import type { ReadableOnOptions } from './readable';

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
  minContrast?: number,
): string {
  const pool = filterReadable('leastVivid', collectScopeColors(scope, not), readableOn, minContrast);
  let bestHex: string | null = null;
  let bestChroma = Infinity;

  for (const candidate of pool) {
    const chroma = toOklch(candidate.parsed)?.c;
    if (typeof chroma !== 'number') continue;
    if (chroma < bestChroma) {
      bestChroma = chroma;
      bestHex = candidate.hex;
    }
  }

  if (!bestHex) {
    throw new FunctionError(
      'leastVivid: no valid color candidates found in scope',
      'leastVivid',
    );
  }

  return bestHex;
}

export interface LeastVividOptions extends ReadableOnOptions {
  /** Keys to exclude from the candidate pool. Pass `ref('scope.token')`
   *  or a literal `'scope.token'` string. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: unknown;
}

export function leastVivid(scope: Scope, options?: LeastVividOptions): FunctionTokenValue {
  const readable = readableOnParts('leastVivid', options);

  return createFunctionToken('leastVivid', [scope, ...readable.args], {
    description: options?.description,
    options: { not: normalizeNotKeys(options?.not), ...readable.options },
    metadata: {
      dependencies: readable.dependencies,
      visualDependencies: extractVisualDependencies([scope, ...readable.args]),
      returnType: 'color',
    },
  });
}
