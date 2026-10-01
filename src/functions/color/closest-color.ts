import { parse, formatHex } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { collectScopeColors, perceptualDistance } from './scope-colors';
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
    return '#00000000';
  }
  // Candidates are compared in their sRGB hex form (that is what the function
  // returns), so clamp the target the same way. Otherwise a wide-gamut token
  // measured against its own clamped hex would not be at distance zero.
  const targetParsed = parse(formatHex(targetRaw));
  if (!targetParsed) {
    return '#00000000';
  }

  let closestHex: string | null = null;
  let closestDistance = Infinity;

  const pool = filterReadable('closestColor', collectScopeColors(scope, not), readableOn, minContrast);
  for (const candidate of pool) {
    const distance = perceptualDistance(targetParsed, candidate.parsed);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestHex = candidate.hex;
    }
  }

  return closestHex ?? '#00000000';
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
