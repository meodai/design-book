import { parse, formatHex, converter } from 'culori';
import { createFunctionToken, extractVisualDependencies, getTokenProcessors, normalizeNotKeys } from '../../tokens';
import type { FunctionTokenValue, ReferenceValue, TokenValue } from '../../tokens';
import type { Scope } from '../../scope';

export function averageColorImpl(scope: Scope, colorSpace: string, not: string[] = []): string {
  const toSpace = converter(colorSpace as any);
  const toRgb = converter('rgb');

  const excluded = new Set(not);
  const converted: any[] = [];

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

    const parsed = parse(colorHex);
    if (!parsed) continue;

    const inSpace = toSpace(parsed);
    if (!inSpace) continue;

    converted.push(inSpace);
  }

  if (converted.length === 0) {
    return '#00000000';
  }

  // Collect all channel keys (excluding 'mode' and 'alpha')
  const channelKeys = Object.keys(converted[0]).filter(
    k => k !== 'mode' && k !== 'alpha'
  );

  const averaged: any = { mode: colorSpace };

  for (const channel of channelKeys) {
    const sum = converted.reduce((acc, c) => acc + (c[channel] ?? 0), 0);
    averaged[channel] = sum / converted.length;
  }

  // Average alpha too
  const alphaSum = converted.reduce((acc, c) => acc + (c.alpha ?? 1), 0);
  averaged.alpha = alphaSum / converted.length;

  const result = formatHex(averaged);
  return result ?? '#000000';
}

export function averageColor(
  scope: Scope,
  options?: {
    colorSpace?: string;
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  const colorSpace = options?.colorSpace ?? 'lab';

  return createFunctionToken(
    'averageColor',
    [scope],
    {
      description: options?.description,
      options: { colorSpace, not: normalizeNotKeys(options?.not) },
      metadata: {
        dependencies: [],
        visualDependencies: extractVisualDependencies([scope]),
        returnType: 'color',
      },
    },
  );
}
