import { parse, formatHex, converter } from 'culori';
import { extractVisualDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue } from '../../tokens';
import type { Scope } from '../../scope';

export function averageColorImpl(scope: Scope, colorSpace: string): string {
  const toSpace = converter(colorSpace as any);
  const toRgb = converter('rgb');

  const converted: any[] = [];

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
  options?: { colorSpace?: string; description?: string; [key: string]: any }
): FunctionTokenValue {
  const colorSpace = options?.colorSpace ?? 'lab';

  return val(
    {
      type: 'function' as const,
      rawValue: 'averageColor',
      implementation: (resolvedScope: Scope) =>
        averageColorImpl(resolvedScope, colorSpace),
      args: [scope],
      metadata: {
        dependencies: [],
        visualDependencies: extractVisualDependencies([scope]),
        returnType: 'color',
      },
    },
    options
  );
}
