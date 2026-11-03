import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { converter, parse } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, ReferenceValue, TokenValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { collectScopeColors } from './scope-colors';
import { filterReadable, readableOnParts } from './readable';
import type { ReadableOnOptions } from './readable';

const toOklch = converter('oklch');

type Direction = 'nextLighter' | 'nextDarker';

/**
 * The member of `scope` that is the next step lighter (or darker) than the
 * target: of the candidates on that side of it, the one closest in OKLCH
 * lightness. By value, not by position — the color counterpart of
 * `nextLarger` / `nextSmaller`, so the scope needs no particular order.
 * `minDistance` is a gap in OKLCH L (0–1) the candidate must clear: 0.05 is
 * at least five points lighter. Ties go to the first candidate in scope order;
 * alpha is ignored for the ranking, as in `lightest` / `darkest`.
 */
function nextLightness(
  name: Direction,
  targetValue: string,
  scope: Scope,
  minDistance: number,
  not: string[],
  readableOn: string | null,
  minContrast: number | undefined,
): string {
  const target = parse(targetValue);
  const targetL = target ? toOklch(target)?.l : undefined;
  if (typeof targetL !== 'number') {
    throw new FunctionError(`${name}: cannot parse target color "${targetValue}"`, name);
  }
  const sign = name === 'nextLighter' ? 1 : -1;
  const pool = filterReadable(name, collectScopeColors(scope, not), readableOn, minContrast);

  let bestHex: string | null = null;
  let bestGap = Infinity;
  for (const candidate of pool) {
    const l = toOklch(candidate.parsed)?.l;
    if (typeof l !== 'number') continue;
    const gap = sign * (l - targetL);
    // Strictly past the target by at least minDistance; a tiny epsilon keeps
    // the target's own color (gap 0) out when minDistance is 0.
    if (gap <= minDistance + 1e-9) continue;
    if (gap < bestGap) {
      bestGap = gap;
      bestHex = candidate.hex;
    }
  }

  if (!bestHex) {
    const side = name === 'nextLighter' ? 'lighter' : 'darker';
    throw new FunctionError(
      `${name}: no member of scope "${scope.name}" is ${side} than ${targetValue}`
        + (minDistance ? ` by at least ${minDistance} in OKLCH lightness` : ''),
      name,
    );
  }
  return bestHex;
}

export function nextLighterImpl(
  targetValue: string,
  scope: Scope,
  minDistance = 0,
  not: string[] = [],
  readableOn: string | null = null,
  minContrast?: number,
): string {
  return nextLightness('nextLighter', targetValue, scope, minDistance, not, readableOn, minContrast);
}

export function nextDarkerImpl(
  targetValue: string,
  scope: Scope,
  minDistance = 0,
  not: string[] = [],
  readableOn: string | null = null,
  minContrast?: number,
): string {
  return nextLightness('nextDarker', targetValue, scope, minDistance, not, readableOn, minContrast);
}

export interface NextLightnessOptions extends ReadableOnOptions {
  /** Minimum gap in OKLCH lightness (0–1) the candidate must clear past the
   *  target: 0.05 is at least five points lighter / darker. */
  minDistance?: number;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: unknown;
}

function build(
  name: Direction,
  target: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: NextLightnessOptions,
): FunctionTokenValue {
  const scope = poolArg(name, pool);
  valueArg(name, target);
  const minDistance = options?.minDistance ?? 0;
  if (typeof minDistance !== 'number' || !(minDistance >= 0) || minDistance >= 1) {
    throw new FunctionError(`${name}: \`minDistance\` is a lightness gap between 0 and 1, got ${String(options?.minDistance)}`, name);
  }
  const readable = readableOnParts(name, options);
  return createFunctionToken(name, [target, scope, ...readable.args], {
    description: options?.description,
    options: { ...(minDistance > 0 ? { minDistance } : {}), not: normalizeNotKeys(options?.not), ...readable.options },
    metadata: {
      dependencies: [...extractDependencies([target]), ...readable.dependencies],
      visualDependencies: extractVisualDependencies([target, scope, ...readable.args]),
      returnType: 'color',
    },
  });
}

/** The member of `pool` that is the next step lighter than `target`, by
 *  OKLCH lightness. `nextLighter(ref('.button'), ref('blue'))`. */
export function nextLighter(
  target: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: NextLightnessOptions,
): FunctionTokenValue {
  return build('nextLighter', target, pool, options);
}

/** The member of `pool` that is the next step darker than `target`, by
 *  OKLCH lightness. `nextDarker(ref('.button'), ref('blue'))`. */
export function nextDarker(
  target: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: NextLightnessOptions,
): FunctionTokenValue {
  return build('nextDarker', target, pool, options);
}
