import { parse } from 'culori';
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

export function closestColorImpl(
  targetValue: string,
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  minContrast?: number,
): string {
  const targetRaw = parse(targetValue);
  if (!targetRaw) {
    throw new FunctionError(`closestColor: cannot parse target colour "${targetValue}"`, 'closestColor');
  }
  // Candidates are compared in their gamut-mapped sRGB hex form (that is what
  // the function returns), so map the target the same way. Otherwise a
  // wide-gamut token measured against its own hex would not be at distance zero.
  const targetParsed = parse(formatColor(gamutMapSrgb(targetRaw)) ?? '');
  if (!targetParsed) {
    throw new FunctionError(`closestColor: cannot format target colour "${targetValue}"`, 'closestColor');
  }

  let closestHex: string | null = null;
  let closestDistance = Infinity;

  const pool = filterReadable('closestColor', collectScopeColors(scope, not), readableOn, minContrast);
  // Translucent colours are compared as they are seen: over the readableOn
  // backdrop when there is one, otherwise over both white and black.
  const backdrop = readableOn === null ? null : parse(readableOn) ?? null;
  for (const candidate of pool) {
    const distance = visibleDistance(targetParsed, candidate.parsed, backdrop);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestHex = candidate.hex;
    }
  }

  if (!closestHex) {
    throw new FunctionError('closestColor: no valid colour candidates found in scope', 'closestColor');
  }
  return closestHex;
}

export function closestColor(
  targetColor: TokenValue | ReferenceValue | FunctionTokenValue,
  scope: Scope,
  options?: ReadableOnOptions & {
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  const readable = readableOnParts('closestColor', options);
  return createFunctionToken(
    'closestColor',
    [targetColor, scope, ...readable.args],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not), ...readable.options },
      metadata: {
        dependencies: [...extractDependencies([targetColor]), ...readable.dependencies],
        visualDependencies: extractVisualDependencies([targetColor, scope, ...readable.args]),
        returnType: 'color',
      },
    },
  );
}
