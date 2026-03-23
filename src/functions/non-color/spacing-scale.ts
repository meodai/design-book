import { extractDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

export function spacingScaleImpl(baseValue: string, multiplier: number): string {
  const match = baseValue.match(/^([\d.]+)(.*)$/);
  if (!match) {
    throw new Error(`spacingScale: cannot parse value "${baseValue}"`);
  }
  const num = parseFloat(match[1]);
  const unit = match[2];
  const result = num * multiplier;
  return `${result}${unit}`;
}

export function spacingScale(
  baseValue: TokenValue | ReferenceValue,
  options?: { multiplier?: number; description?: string }
): FunctionTokenValue {
  const multiplier = options?.multiplier ?? 1;
  return val(
    {
      type: 'function' as const,
      rawValue: 'spacingScale',
      implementation: (...args: any[]) => spacingScaleImpl(args[0], multiplier),
      args: [baseValue],
      options: { multiplier },
      metadata: {
        dependencies: extractDependencies([baseValue]),
        visualDependencies: [],
        returnType: 'dimension',
      },
    },
    options
  );
}
