import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

export function spacingScaleImpl(baseValue: string, multiplier: number): string {
  const match = baseValue.match(/^(-?[\d.]+)(.*)$/);
  if (!match) {
    throw new Error(`spacingScale: cannot parse value "${baseValue}"`);
  }
  const num = parseFloat(match[1]);
  const unit = match[2];
  const result = num * multiplier;
  // Round to avoid floating point noise (keep up to 4 significant decimal digits)
  const rounded = Math.round(result * 10000) / 10000;
  return `${rounded}${unit}`;
}

export function spacingScale(
  baseValue: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { multiplier?: number; description?: string }
): FunctionTokenValue {
  const multiplier = options?.multiplier ?? 1;
  return createFunctionToken(
    'spacingScale',
    [baseValue],
    {
      options: { multiplier },
      metadata: {
        dependencies: extractDependencies([baseValue]),
        visualDependencies: [],
        returnType: 'dimension',
      },
    },
  );
}
