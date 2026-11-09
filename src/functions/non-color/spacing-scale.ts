import { parseDimension } from '../../values';
import { FunctionError } from '../../errors';
import { assertNumber, valueArg, assertOptions } from '../args';
import { createFunctionToken } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

/** `base × multiplier`, in the base's unit, rounded to 4 decimals (no
 *  floating-point noise). */
export function spacingScaleImpl(baseValue: string, options?: { multiplier?: number }): string {
  const dim = parseDimension(baseValue);
  if (!dim) throw new FunctionError(`spacingScale: cannot read "${baseValue}" as a number with a unit`, 'spacingScale');
  const rounded = Math.round(dim.num * (options?.multiplier ?? 1) * 10000) / 10000;
  return `${rounded}${dim.unit}`;
}

export function spacingScale(
  baseValue: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { multiplier?: number; description?: string },
): FunctionTokenValue {
  assertOptions('spacingScale', options, ['multiplier']);
  valueArg('spacingScale', baseValue);
  const multiplier = options?.multiplier ?? 1;
  assertNumber('spacingScale', 'multiplier', multiplier);
  return createFunctionToken('spacingScale', [baseValue], {
    description: options?.description,
    options: { multiplier },
    metadata: { dependencies: [], returnType: 'dimension' },
  });
}
