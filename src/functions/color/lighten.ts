import { parse, formatHex, converter } from 'culori';
import { extractDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

const toHsl = converter('hsl');

export function lightenImpl(colorValue: string, amount: number): string {
  const parsed = parse(colorValue);
  if (!parsed) {
    throw new FunctionError(
      `lighten: cannot parse color "${colorValue}"`,
      'lighten'
    );
  }

  const hslColor = toHsl(parsed);
  if (!hslColor) {
    throw new FunctionError(
      `lighten: cannot convert color to HSL "${colorValue}"`,
      'lighten'
    );
  }

  // Increase lightness, clamp to 1
  const newL = Math.min(1, (hslColor.l ?? 0) + amount);
  const lightened = { ...hslColor, l: newL };

  const result = formatHex(lightened);
  if (!result) {
    throw new FunctionError(
      `lighten: failed to format lightened color`,
      'lighten'
    );
  }

  return result;
}

export function lighten(
  color: TokenValue | ReferenceValue,
  options?: { amount?: number; description?: string }
): FunctionTokenValue {
  const amount = options?.amount ?? 0.1;
  return val(
    {
      type: 'function' as const,
      rawValue: 'lighten',
      implementation: (...args: any[]) => lightenImpl(args[0], amount),
      args: [color],
      metadata: {
        dependencies: extractDependencies([color]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
    options
  );
}
