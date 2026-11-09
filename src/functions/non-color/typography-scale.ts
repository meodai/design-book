import { parseDimension } from '../../values';
import { FunctionError } from '../../errors';
import { assertNumber, valueArg } from '../args';
import { createFunctionToken } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

/** `base × ratio^step`, in the base's unit, rounded to 4 decimals (no
 *  floating-point noise). */
export function typographyScaleImpl(baseValue: string, options?: { ratio?: number; step?: number }): string {
  const dim = parseDimension(baseValue);
  if (!dim) throw new FunctionError(`typographyScale: cannot read "${baseValue}" as a number with a unit`, 'typographyScale');
  const value = dim.num * Math.pow(options?.ratio ?? 1.25, options?.step ?? 0);
  return `${Math.round(value * 10000) / 10000}${dim.unit}`;
}

export function typographyScale(
  baseSize: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { ratio?: number; step?: number; description?: string },
): FunctionTokenValue {
  valueArg('typographyScale', baseSize);
  const ratio = options?.ratio ?? 1.25;
  const step = options?.step ?? 0;
  assertNumber('typographyScale', 'ratio', ratio, { positive: true });
  assertNumber('typographyScale', 'step', step);
  return createFunctionToken('typographyScale', [baseSize], {
    description: options?.description,
    options: { ratio, step },
    metadata: { dependencies: [], returnType: 'dimension' },
  });
}
