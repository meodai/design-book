import { parseDimension } from '../../values';
import { FunctionError } from '../../errors';
import { valueArg } from '../args';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

export function typographyScaleImpl(baseValue: string, ratio: number, step: number): string {
  const dim = parseDimension(baseValue);
  if (!dim) throw new FunctionError(`typographyScale: cannot read "${baseValue}" as a number with a unit`, 'typographyScale');
  const { num, unit } = dim;
  const result = num * Math.pow(ratio, step);
  // Round to avoid floating point noise (keep up to 4 significant decimal digits)
  const rounded = Math.round(result * 10000) / 10000;
  return `${rounded}${unit}`;
}

export function typographyScale(
  baseSize: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { ratio?: number; step?: number; description?: string }
): FunctionTokenValue {
  valueArg('typographyScale', baseSize);
  const ratio = options?.ratio ?? 1.25;
  const step = options?.step ?? 0;
  return createFunctionToken(
    'typographyScale',
    [baseSize],
    {
      description: options?.description,
      options: { ratio, step },
      metadata: {
        dependencies: extractDependencies([baseSize]),
        visualDependencies: [],
        returnType: 'dimension',
      },
    },
  );
}
