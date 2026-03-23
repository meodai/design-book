import { parse, formatHex } from 'culori';
import { extractDependencies, extractVisualDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';

export function closestColorImpl(targetValue: string, scope: Scope): string {
  const targetParsed = parse(targetValue);
  if (!targetParsed) {
    return '#00000000';
  }

  const targetRgb = parse(formatHex(targetParsed) ?? targetValue);
  if (!targetRgb) {
    return '#00000000';
  }

  const tr = (targetRgb as any).r ?? 0;
  const tg = (targetRgb as any).g ?? 0;
  const tb = (targetRgb as any).b ?? 0;

  let closestHex: string | null = null;
  let closestDistance = Infinity;

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

    const candidateParsed = parse(colorHex);
    if (!candidateParsed) continue;

    const cr = (candidateParsed as any).r ?? 0;
    const cg = (candidateParsed as any).g ?? 0;
    const cb = (candidateParsed as any).b ?? 0;

    const distance = Math.sqrt(
      (tr - cr) ** 2 + (tg - cg) ** 2 + (tb - cb) ** 2
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestHex = colorHex;
    }
  }

  return closestHex ?? '#00000000';
}

export function closestColor(
  targetColor: TokenValue | ReferenceValue,
  scope: Scope,
  options?: { description?: string; [key: string]: any }
): FunctionTokenValue {
  return val(
    {
      type: 'function' as const,
      rawValue: 'closestColor',
      implementation: (resolvedTarget: string, resolvedScope: Scope) =>
        closestColorImpl(resolvedTarget, resolvedScope),
      args: [targetColor, scope],
      metadata: {
        dependencies: extractDependencies([targetColor]),
        visualDependencies: extractVisualDependencies([targetColor, scope]),
        returnType: 'color',
      },
    },
    options
  );
}
