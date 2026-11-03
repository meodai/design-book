import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { converter, parse } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { collectScopeColors, formatColor, gamutMapSrgb, visibleDistance } from './scope-colors';
import { filterReadable, readableOnParts } from './readable';
import type { ReadableOnOptions } from './readable';

const toOklch = converter('oklch');

/** Which side of the target a directional pick may come from. */
export interface ClosestDirection {
  /** Only candidates lighter / darker than the target. */
  direction?: 'lighter' | 'darker';
  /** The side another color lies on, and no further than its lightness. */
  toward?: string;
  /** Gap in OKLCH lightness (0–1) a candidate must clear past the target. */
  minDistance?: number;
}

export function closestColorImpl(
  targetValue: string,
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  minContrast?: number,
  side: ClosestDirection = {},
): string {
  const targetRaw = parse(targetValue);
  if (!targetRaw) {
    throw new FunctionError(`closestColor: cannot parse target color "${targetValue}"`, 'closestColor');
  }
  // Candidates are compared in their gamut-mapped sRGB hex form (that is what
  // the function returns), so map the target the same way. Otherwise a
  // wide-gamut token measured against its own hex would not be at distance zero.
  const targetParsed = parse(formatColor(gamutMapSrgb(targetRaw)) ?? '');
  if (!targetParsed) {
    throw new FunctionError(`closestColor: cannot format target color "${targetValue}"`, 'closestColor');
  }

  // A direction keeps only the candidates on one side of the target's OKLCH
  // lightness — strictly past it by minDistance — and `toward` no further
  // than the other color's lightness.
  const lightness = (c: Parameters<typeof toOklch>[0]) => toOklch(c)?.l ?? NaN;
  const targetL = lightness(targetParsed);
  let sign = side.direction === 'lighter' ? 1 : side.direction === 'darker' ? -1 : 0;
  let limit = Infinity;
  if (side.toward !== undefined) {
    const towardParsed = parse(side.toward);
    if (!towardParsed) {
      throw new FunctionError(`closestColor: cannot parse \`toward\` color "${side.toward}"`, 'closestColor');
    }
    const towardL = lightness(towardParsed);
    sign = Math.sign(towardL - targetL);
    limit = Math.abs(towardL - targetL) + 1e-9;
  }
  const minGap = (side.minDistance ?? 0) + 1e-9;
  const onSide = (l: number) => {
    if (sign === 0) return true;
    const gap = sign * (l - targetL);
    return gap > minGap && gap <= limit;
  };

  let closestHex: string | null = null;
  let closestDistance = Infinity;

  const pool = filterReadable('closestColor', collectScopeColors(scope, not), readableOn, minContrast);
  // Translucent colors are compared as they are seen: over the readableOn
  // backdrop when there is one, otherwise over both white and black.
  const backdrop = readableOn === null ? null : parse(readableOn) ?? null;
  for (const candidate of pool) {
    if (!onSide(lightness(candidate.parsed))) continue;
    const distance = visibleDistance(targetParsed, candidate.parsed, backdrop);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestHex = candidate.hex;
    }
  }

  if (!closestHex) {
    if (sign !== 0) {
      const where = side.toward !== undefined
        ? `between ${targetValue} and ${side.toward}`
        : `${side.direction} than ${targetValue}`;
      throw new FunctionError(
        `closestColor: no member of scope "${scope.name}" is ${where}`
          + (side.minDistance ? ` by at least ${side.minDistance} in OKLCH lightness` : ''),
        'closestColor',
      );
    }
    throw new FunctionError('closestColor: no valid color candidates found in scope', 'closestColor');
  }
  return closestHex;
}

export interface ClosestColorOptions extends ReadableOnOptions {
  /** Only consider candidates lighter or darker than the target. */
  direction?: 'lighter' | 'darker';
  /** Only consider candidates on this color's side of the target, and no
   *  further than its lightness: one rule that goes lighter on a light page
   *  and darker on a dark one. */
  toward?: TokenValue | ReferenceValue | FunctionTokenValue;
  /** With a direction: a gap in OKLCH lightness (0–1) the pick must clear. */
  minDistance?: number;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

/**
 * The member of `pool` perceptually closest to the target (Euclidean
 * distance in OKLab). With `direction: 'lighter' | 'darker'` only members on
 * that side of the target's OKLCH lightness count — the nearest look-alike
 * that is lighter — and `toward: ref('.page')` takes the side from where
 * another color lies, stopping at its lightness. `minDistance` is a gap in
 * OKLCH lightness the pick must clear.
 */
export function closestColor(
  targetColor: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: ClosestColorOptions,
): FunctionTokenValue {
  const scope = poolArg('closestColor', pool);
  valueArg('closestColor', targetColor);
  const { direction, toward, minDistance } = options ?? {};
  if (direction !== undefined && direction !== 'lighter' && direction !== 'darker') {
    throw new FunctionError(`closestColor: \`direction\` is 'lighter' or 'darker', got ${String(direction)}`, 'closestColor');
  }
  if (direction !== undefined && toward !== undefined) {
    throw new FunctionError('closestColor: pass `direction` or `toward`, not both', 'closestColor');
  }
  if (minDistance !== undefined) {
    if (direction === undefined && toward === undefined) {
      throw new FunctionError('closestColor: `minDistance` needs a `direction` or `toward`', 'closestColor');
    }
    if (typeof minDistance !== 'number' || !(minDistance >= 0) || minDistance >= 1) {
      throw new FunctionError(`closestColor: \`minDistance\` is a lightness gap between 0 and 1, got ${String(minDistance)}`, 'closestColor');
    }
  }
  if (toward !== undefined) valueArg('closestColor', toward);
  const readable = readableOnParts('closestColor', options);
  // `toward` is an argument, so it resolves like one and is a dependency;
  // it sits before the optional readableOn backdrop, marked in the options.
  const towardArgs = toward !== undefined ? [toward] : [];
  return createFunctionToken(
    'closestColor',
    [targetColor, scope, ...towardArgs, ...readable.args],
    {
      description: options?.description,
      options: {
        not: normalizeNotKeys(options?.not),
        ...(direction ? { direction } : {}),
        ...(toward !== undefined ? { toward: true } : {}),
        ...(minDistance ? { minDistance } : {}),
        ...readable.options,
      },
      metadata: {
        dependencies: [...extractDependencies([targetColor, ...towardArgs]), ...readable.dependencies],
        visualDependencies: extractVisualDependencies([targetColor, scope, ...towardArgs, ...readable.args]),
        returnType: 'color',
      },
    },
  );
}
