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

export function closestColorImpl(targetValue: string, scope: Scope, not: string[] = []): string {
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

  for (const candidate of collectScopeColors(scope, not)) {
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
  options?: {
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  return createFunctionToken(
    'closestColor',
    [targetColor, scope],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not) },
      metadata: {
        dependencies: extractDependencies([targetColor]),
        visualDependencies: extractVisualDependencies([targetColor, scope]),
        returnType: 'color',
      },
    },
  );
}
