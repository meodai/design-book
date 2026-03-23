import { parse, formatHex, converter } from 'culori';
import { extractDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

export function relativeToImpl(
  colorValue: string,
  colorSpace: string,
  modifications: (null | number | string)[]
): string {
  const parsed = parse(colorValue);
  if (!parsed) {
    throw new FunctionError(
      `relativeTo: cannot parse color "${colorValue}"`,
      'relativeTo'
    );
  }

  const toSpace = converter(colorSpace as any);
  const converted = toSpace(parsed);
  if (!converted) {
    throw new FunctionError(
      `relativeTo: cannot convert color to "${colorSpace}"`,
      'relativeTo'
    );
  }

  // Get channel names by excluding 'mode' and 'alpha'
  const channels = Object.keys(converted).filter(k => k !== 'mode' && k !== 'alpha');

  const modified = { ...converted } as any;

  for (let i = 0; i < modifications.length; i++) {
    const mod = modifications[i];
    const channel = channels[i];
    if (channel === undefined || mod === null) continue;

    const currentValue = modified[channel] ?? 0;

    if (typeof mod === 'number') {
      modified[channel] = mod;
    } else if (typeof mod === 'string') {
      const operator = mod[0];
      const value = parseFloat(mod.slice(1));

      if (operator === '+') {
        modified[channel] = currentValue + value;
      } else if (operator === '-') {
        modified[channel] = currentValue - value;
      } else if (operator === '*') {
        modified[channel] = currentValue * value;
      } else if (operator === '/') {
        modified[channel] = currentValue / value;
      } else {
        // Treat as absolute numeric string
        modified[channel] = parseFloat(mod);
      }
    }
  }

  const result = formatHex(modified);
  if (!result) {
    throw new FunctionError(
      `relativeTo: failed to format modified color`,
      'relativeTo'
    );
  }

  return result;
}

export function relativeTo(
  baseColor: TokenValue | ReferenceValue,
  colorSpace: string,
  modifications: (null | number | string)[],
  options?: { description?: string }
): FunctionTokenValue {
  return val(
    {
      type: 'function' as const,
      rawValue: 'relativeTo',
      implementation: (...args: any[]) => relativeToImpl(args[0], colorSpace, modifications),
      args: [baseColor],
      options: { colorSpace, modifications },
      metadata: {
        dependencies: extractDependencies([baseColor]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
    options
  );
}
