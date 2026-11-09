import { poolArg, valueArg, assertOptions, READABLE_OPTIONS } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, toMembers } from '../../tokens';
import type { FunctionTokenValue, MemberReference, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { assertDirection, assertDirectionFits, measuredContrast, onLightnessSide } from '../kinds';
import type { Direction } from '../kinds';
import { best, colorPool, lightnessOf, measureOf, measuredPool, parseColor } from '../pool';
import { contrastAgainst } from './color-math';
import { readableOnOptions } from './readable';
import type { ReadableOn, ReadableOnOptions } from './readable';
import { picked } from '../picks';

/** The contrast selectors' options as the implementation receives them. */
export interface ContrastInputs extends ReadableOn {
  /** Qualified member keys left out (the registry has read `not`). */
  not: string[];
  direction?: Direction;
}

/** The member of `scope` that contrasts most with the target: WCAG ratio
 *  for colors, the ratio of the two values for sizes and text styles. */
export function bestContrastWithImpl(targetValue: string, scope: Scope, options: ContrastInputs): string {
  const fn = 'bestContrastWith';
  const { not, direction, readableOn, readableContrast } = options;
  const measure = measureOf(targetValue);
  if (measure && readableOn !== undefined) {
    throw new FunctionError(`${fn}: \`readableOn\` is for colors; the target is a size or a text style`, fn);
  }
  if (measure) return measuredContrast(fn, targetValue, measure, scope, measuredPool(scope, not), direction, { pick: 'best' });
  assertDirectionFits(fn, direction, 'color');
  const target = parseColor(targetValue);
  if (!target) throw new FunctionError(`${fn}: cannot parse target color "${targetValue}"`, fn);
  const targetL = lightnessOf(target);
  const top = best(
    colorPool(fn, scope, not, readableOn, readableContrast).filter((c) => onLightnessSide(direction, targetL, c.l)),
    (c) => contrastAgainst(target, c.color),
    'max',
  );
  if (!top) throw new FunctionError(`${fn}: no valid color candidates found in scope`, fn);
  return picked(scope, top.key, top.hex);
}

export function bestContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: ReadableOnOptions & {
    /** Only candidates on that side of the target: 'lighter' / 'darker' for
     *  colors, 'larger' / 'smaller' for sizes and text styles. */
    direction?: Direction;
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue | MemberReference>;
    description?: string;
  },
): FunctionTokenValue {
  assertOptions('bestContrastWith', options, ['direction', 'not', ...READABLE_OPTIONS]);
  const fn = 'bestContrastWith';
  const scope = poolArg(fn, pool);
  valueArg(fn, targetValue);
  assertDirection(fn, options?.direction);
  return createFunctionToken(fn, [targetValue, scope], {
    description: options?.description,
    options: {
      not: toMembers(options?.not),
      ...(options?.direction ? { direction: options.direction } : {}),
      ...readableOnOptions(fn, options),
    },
    // A color, a size or a text style, as the target is.
    metadata: { dependencies: [], returnType: undefined },
  });
}
