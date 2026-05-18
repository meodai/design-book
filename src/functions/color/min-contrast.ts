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

export interface MinContrastOptions {
  ratio?: number;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

export function minContrastWithImpl(
  targetValue: string,
  scope: Scope,
  ratio: number,
  not: string[] = [],
): string {
  const targetColor = parse(targetValue);
  if (!targetColor) {
    throw new FunctionError(
      `minContrastWith: cannot parse target color "${targetValue}"`,
      'minContrastWith'
    );
  }

  const excluded = new Set(not);

  // `not` may also reference tokens outside the iterated scope (e.g. another
  // scope's selector). Pre-resolve those to hex so candidates whose value
  // matches one are excluded — lets `not: [ref('ui.accent')]` keep this
  // selector from landing on whatever accent currently picks.
  const excludedHexes = new Set<string>();
  const localPrefix = `${scope.name}.`;
  for (const k of not) {
    if (k.startsWith(localPrefix)) continue;
    try {
      const parsed = parse(scope.resolveKey(k));
      const hex = parsed ? formatHex(parsed) : null;
      if (hex) excludedHexes.add(hex);
    } catch { /* unresolvable — skip */ }
  }

  const candidates: Array<{ hex: string; contrast: number }> = [];

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
      // Reference or function token — resolve through the scope so the
      // candidate pool includes computed colors (colorMix, lighten, darken,
      // etc.), not just hand-written ones.
      try {
        const resolved = scope.resolve(key);
        const parsed = parse(resolved);
        if (parsed) colorHex = formatHex(parsed) ?? null;
      } catch {
        continue;
      }
    }

    if (!colorHex) continue;
    if (excludedHexes.has(colorHex)) continue;

    const candidateColor = parse(colorHex);
    if (!candidateColor) continue;

    const contrast = wcagContrast(targetColor, candidateColor);
    candidates.push({ hex: colorHex, contrast });
  }

  if (candidates.length === 0) {
    throw new FunctionError(
      'minContrastWith: no valid color candidates found in scope',
      'minContrastWith'
    );
  }

  const meetingThreshold = candidates.filter(c => c.contrast >= ratio);

  if (meetingThreshold.length > 0) {
    // Return the one with lowest contrast among those meeting the threshold
    meetingThreshold.sort((a, b) => a.contrast - b.contrast);
    return meetingThreshold[0].hex;
  }

  // Fallback: return highest contrast
  candidates.sort((a, b) => b.contrast - a.contrast);
  return candidates[0].hex;
}

export function minContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  scope: Scope,
  options?: MinContrastOptions
): FunctionTokenValue {
  const { ratio = 4.5, not, description, ...rest } = options ?? {};
  const notKeys = normalizeNotKeys(not);

  return createFunctionToken(
    'minContrastWith',
    [targetValue, scope],
    {
      description,
      ...rest,
      options: { ratio, not: notKeys },
      metadata: {
        // `not` keys are real dependencies — when the token they reference
        // changes, this selector must re-evaluate (its candidate pool may
        // gain or lose a value-based exclusion).
        dependencies: [...extractDependencies([targetValue]), ...notKeys],
        visualDependencies: extractVisualDependencies([targetValue, scope]),
        returnType: 'color',
      },
    },
  );
}
