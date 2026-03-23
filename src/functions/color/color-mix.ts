import { parse, interpolate, formatHex } from 'culori';
import { extractDependencies, extractVisualDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';

export function colorMixImpl(
  color1Value: string,
  color2Value: string,
  ratio: number,
  colorSpace: string
): string {
  const parsed1 = parse(color1Value);
  if (!parsed1) {
    throw new FunctionError(
      `colorMix: cannot parse color1 "${color1Value}"`,
      'colorMix'
    );
  }

  const parsed2 = parse(color2Value);
  if (!parsed2) {
    throw new FunctionError(
      `colorMix: cannot parse color2 "${color2Value}"`,
      'colorMix'
    );
  }

  const mixer = interpolate([parsed1, parsed2], colorSpace as any);
  const mixed = mixer(ratio);
  const result = formatHex(mixed);

  if (!result) {
    throw new FunctionError(
      `colorMix: failed to format mixed color`,
      'colorMix'
    );
  }

  return result;
}

export function colorMix(
  color1: TokenValue | ReferenceValue,
  color2: TokenValue | ReferenceValue,
  scope: Scope,
  options?: { ratio?: number; colorSpace?: string; description?: string }
): FunctionTokenValue {
  const ratio = options?.ratio ?? 0.5;
  const colorSpace = options?.colorSpace ?? 'lab';
  return val(
    {
      type: 'function' as const,
      rawValue: 'colorMix',
      implementation: (...args: any[]) => colorMixImpl(args[0], args[1], ratio, colorSpace),
      args: [color1, color2, scope],
      metadata: {
        dependencies: extractDependencies([color1, color2]),
        visualDependencies: extractVisualDependencies([color1, color2, scope]),
        returnType: 'color',
      },
    },
    options
  );
}
