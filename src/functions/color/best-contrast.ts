import { wcagContrast, formatHex, parse } from 'culori';
import { extractDependencies, extractVisualDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';

export function bestContrastWithImpl(targetValue: string, scope: Scope): string {
  const targetColor = parse(targetValue);
  if (!targetColor) {
    throw new FunctionError(
      `bestContrastWith: cannot parse target color "${targetValue}"`,
      'bestContrastWith'
    );
  }

  let bestHex: string | null = null;
  let bestRatio = -1;

  for (const key of scope.getAllKeys()) {
    const token = scope.get(key);
    if (!token) continue;

    let colorHex: string | null = null;

    if (token.type === 'color') {
      const tv = token as TokenValue;
      if (tv.processors && tv.processors[0]) {
        const formatted = formatHex(tv.processors[0].instance);
        if (formatted) colorHex = formatted;
      }
      if (!colorHex) {
        const parsed = parse(String(tv.rawValue));
        if (parsed) colorHex = formatHex(parsed) ?? null;
      }
    } else if (token.type === 'reference') {
      try {
        const resolved = scope.resolve(key);
        const parsed = parse(resolved);
        if (parsed) colorHex = formatHex(parsed) ?? null;
      } catch {
        continue;
      }
    } else {
      continue;
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
  targetValue: TokenValue | ReferenceValue,
  scope: Scope,
  options?: { description?: string; [key: string]: any }
): FunctionTokenValue {
  return val(
    {
      type: 'function' as const,
      rawValue: 'bestContrastWith',
      implementation: bestContrastWithImpl,
      args: [targetValue, scope],
      metadata: {
        dependencies: extractDependencies([targetValue]),
        visualDependencies: extractVisualDependencies([targetValue, scope]),
        returnType: 'color',
      },
    },
    options
  );
}
