import { wcagContrast, formatHex, parse } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  getTokenProcessors,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';

export function bestContrastWithImpl(targetValue: string, scope: Scope, not: string[] = []): string {
  const targetColor = parse(targetValue);
  if (!targetColor) {
    throw new FunctionError(
      `bestContrastWith: cannot parse target color "${targetValue}"`,
      'bestContrastWith'
    );
  }

  const excluded = new Set(not);
  let bestHex: string | null = null;
  let bestRatio = -1;

  for (const key of scope.getAllKeys()) {
    if (excluded.has(`${scope.name}.${key}`)) continue;
    const token = scope.get(key);
    if (!token) continue;

    let colorHex: string | null = null;

    if (token.type === 'color') {
      const tv = token as TokenValue;
      const processors = getTokenProcessors(tv);
      if (processors && processors[0]) {
        const formatted = formatHex(processors[0].instance);
        if (formatted) colorHex = formatted;
      }
      if (!colorHex) {
        const parsed = parse(String(tv.rawValue));
        if (parsed) colorHex = formatHex(parsed) ?? null;
      }
    } else {
      // Reference or function token — resolve through the scope so the candidate
      // pool includes computed colors (colorMix, lighten, darken, etc.), not
      // just hand-written ones.
      try {
        const resolved = scope.resolve(key);
        const parsed = parse(resolved);
        if (parsed) colorHex = formatHex(parsed) ?? null;
      } catch {
        continue;
      }
    }

    if (!colorHex) continue;

    const candidateColor = parse(colorHex);
    if (!candidateColor) continue;

    const ratio = wcagContrast(targetColor, candidateColor);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestHex = colorHex;
    }
  }

  if (!bestHex) {
    throw new FunctionError(
      'bestContrastWith: no valid color candidates found in scope',
      'bestContrastWith'
    );
  }

  return bestHex;
}

export function bestContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  scope: Scope,
  options?: {
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  return createFunctionToken(
    'bestContrastWith',
    [targetValue, scope],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not) },
      metadata: {
        dependencies: extractDependencies([targetValue]),
        visualDependencies: extractVisualDependencies([targetValue, scope]),
        returnType: 'color',
      },
    },
  );
}
