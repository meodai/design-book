import { parseDimension } from '../../values';
import { FunctionError } from '../../errors';
import { valueArg } from '../args';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

export function spacingScaleImpl(baseValue: string, multiplier: number): string {
  const dim = parseDimension(baseValue);
  if (!dim) throw new FunctionError(`spacingScale: cannot read "${baseValue}" as a number with a unit`, 'spacingScale');
  const { num, unit } = dim;
  const result = num * multiplier;
  // Round to avoid floating point noise (keep up to 4 significant decimal digits)
  const rounded = Math.round(result * 10000) / 10000;
  return `${rounded}${unit}`;
}

export function spacingScale(
  baseValue: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { multiplier?: number; description?: string }
): FunctionTokenValue {
  valueArg('spacingScale', baseValue);
  const multiplier = options?.multiplier ?? 1;
  return createFunctionToken(
    'spacingScale',
    [baseValue],
    {
      description: options?.description,
      options: { multiplier },
      metadata: {
        dependencies: extractDependencies([baseValue]),
        returnType: 'dimension',
      },
    },
  );
}
