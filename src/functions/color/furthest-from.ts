import { parse, formatHex, converter, differenceEuclidean } from 'culori';
import { createFunctionToken, extractVisualDependencies, getTokenProcessors } from '../../tokens';
import type { FunctionTokenValue, TokenValue } from '../../tokens';
import type { Scope } from '../../scope';

const toLab = converter('lab');
const deltaE = differenceEuclidean('lab');

export function furthestFromImpl(scope: Scope): string {
  const colors: Array<{ hex: string; lab: any }> = [];

  for (const key of scope.getAllKeys()) {
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

    const lab = toLab(parsed);
    if (!lab) continue;

    colors.push({ hex: colorHex, lab });
  }

  if (colors.length === 0) {
    return '#00000000';
  }

  if (colors.length === 1) {
    return colors[0].hex;
  }

  let furthestHex: string = colors[0].hex;
  let highestAvgDistance = -1;

  for (let i = 0; i < colors.length; i++) {
    let totalDistance = 0;
    for (let j = 0; j < colors.length; j++) {
      if (i === j) continue;
      totalDistance += deltaE(colors[i].lab, colors[j].lab);
    }
    const avgDistance = totalDistance / (colors.length - 1);
    if (avgDistance > highestAvgDistance) {
      highestAvgDistance = avgDistance;
      furthestHex = colors[i].hex;
    }
  }

  return furthestHex;
}

export function furthestFrom(
  scope: Scope,
  options?: { description?: string; [key: string]: any }
): FunctionTokenValue {
  return createFunctionToken(
    'furthestFrom',
    [scope],
    {
      metadata: {
        dependencies: [],
        visualDependencies: extractVisualDependencies([scope]),
        returnType: 'color',
      },
    },
  );
}
