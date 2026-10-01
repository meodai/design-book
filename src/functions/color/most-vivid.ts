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
 * Returns the colour from a scope with the highest OKLCH chroma — the
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
  minContrast?: number,
): string {
  const pool = filterReadable('mostVivid', collectScopeColors(scope, not), readableOn, minContrast);
  let bestHex: string | null = null;
  let bestChroma = -Infinity;

  for (const candidate of pool) {
    const chroma = toOklch(candidate.parsed)?.c;
    if (typeof chroma !== 'number') continue;
    if (chroma > bestChroma) {
      bestChroma = chroma;
      bestHex = candidate.hex;
    }
  }

  if (!bestHex) {
    throw new FunctionError(
      'mostVivid: no valid colour candidates found in scope',
      'mostVivid',
    );
  }

  return bestHex;
}

export interface MostVividOptions extends ReadableOnOptions {
  /** Keys to exclude from the candidate pool. Pass `ref('scope.token')`
   *  or a literal `'scope.token'` string. Useful for keeping role-loaded
   *  tokens like `values.error` out of accent-colour picking. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: unknown;
}

export function mostVivid(scope: Scope, options?: MostVividOptions): FunctionTokenValue {
  const readable = readableOnParts('mostVivid', options);

  return createFunctionToken('mostVivid', [scope, ...readable.args], {
    description: options?.description,
    options: { not: normalizeNotKeys(options?.not), ...readable.options },
    metadata: {
      dependencies: readable.dependencies,
      visualDependencies: extractVisualDependencies([scope, ...readable.args]),
      returnType: 'color',
    },
  });
}
