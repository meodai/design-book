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
 * Returns the colour from a scope at one end of the OKLCH lightness axis.
 * OKLCH L rather than HSL lightness, which calls #ffff00 and #0000ff equally
 * light, and rather than WCAG luminance, which is a contrast measure and not
 * perceptually uniform. Ties go to the first candidate in scope order.
 *
 * Alpha is not factored in: there is no backdrop to composite over, so a
 * translucent candidate is ranked by the lightness of its colour and
 * returned with its alpha intact. (`readableOn` does composite, but only to
 * decide which candidates stay in the pool.)
 */
function extremeLightness(
  name: 'lightest' | 'darkest',
  scope: Scope,
  not: string[],
  readableOn: string | null,
  minContrast: number | undefined,
): string {
  const pool = filterReadable(name, collectScopeColors(scope, not), readableOn, minContrast);
  const sign = name === 'lightest' ? 1 : -1;
  let bestHex: string | null = null;
  let bestScore = -Infinity;

  for (const candidate of pool) {
    const l = toOklch(candidate.parsed)?.l;
    if (typeof l !== 'number') continue;
    const score = sign * l;
    if (score > bestScore) {
      bestScore = score;
      bestHex = candidate.hex;
    }
  }

  if (!bestHex) {
    throw new FunctionError(`${name}: no valid colour candidates found in scope`, name);
  }
  return bestHex;
}

export function lightestImpl(
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  minContrast?: number,
): string {
  return extremeLightness('lightest', scope, not, readableOn, minContrast);
}

export function darkestImpl(
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  minContrast?: number,
): string {
  return extremeLightness('darkest', scope, not, readableOn, minContrast);
}

export interface LightnessSelectorOptions extends ReadableOnOptions {
  /** Keys to exclude from the candidate pool. Pass `ref('scope.token')`
   *  or a literal `'scope.token'` string. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: unknown;
}

function lightnessSelector(
  name: 'lightest' | 'darkest',
  scope: Scope,
  options?: LightnessSelectorOptions,
): FunctionTokenValue {
  const readable = readableOnParts(name, options);
  return createFunctionToken(name, [scope, ...readable.args], {
    description: options?.description,
    options: { not: normalizeNotKeys(options?.not), ...readable.options },
    metadata: {
      dependencies: readable.dependencies,
      visualDependencies: extractVisualDependencies([scope, ...readable.args]),
      returnType: 'color',
    },
  });
}

/** The colour in `scope` with the highest OKLCH lightness. */
export function lightest(scope: Scope, options?: LightnessSelectorOptions): FunctionTokenValue {
  return lightnessSelector('lightest', scope, options);
}

/** The colour in `scope` with the lowest OKLCH lightness. */
export function darkest(scope: Scope, options?: LightnessSelectorOptions): FunctionTokenValue {
  return lightnessSelector('darkest', scope, options);
}
