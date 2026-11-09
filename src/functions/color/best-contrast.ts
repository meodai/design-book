import { poolArg, valueArg, assertOptions, READABLE_OPTIONS } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, toMembers } from '../../tokens';
import type { FunctionTokenValue, MemberReference, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { assertDirection, assertDirectionFits, measuredContrast, onLightnessSide, byOption } from '../kinds';
import type { Direction } from '../kinds';
import { best, colorPool, lightnessOf, measureOf, measuredPool, parseColor, colorValueOf, colorTarget } from '../pool';
import type { Measurable } from '../pool';
import { contrastAgainst } from './color-math';
import { readableOnOptions } from './readable';
import type { ReadableOn, ReadableOnOptions } from './readable';
import { pick } from '../picks';
import type { Pick } from '../picks';

/** The contrast selectors' options as the implementation receives them. */
export interface ContrastInputs extends ReadableOn {
  /** Qualified member keys left out (the registry has read `not`). */
  not: string[];
  direction?: Direction;
  /** The field text styles are measured by. */
  by?: string;
}

/** The member of `scope` that contrasts most with the target: WCAG ratio
 *  for colors, the ratio of the two values for sizes and text styles. */
export function bestContrastWithImpl(targetValue: Measurable, scope: Scope, options: ContrastInputs): Pick {
  const fn = 'bestContrastWith';
  const { not, direction, readableOn, readableContrast, by } = options;
  const measure = measureOf(targetValue, by);
  if (measure && readableOn !== undefined) {
    throw new FunctionError(`${fn}: \`readableOn\` is for colors; the target is a size or a text style`, fn);
  }
  if (measure) return measuredContrast(fn, targetValue, measure, scope, measuredPool(scope, not, by), direction, { pick: 'best' });
  assertDirectionFits(fn, direction, 'color');
  const target = parseColor(colorTarget(fn, targetValue, by));
  if (!target) throw new FunctionError(`${fn}: cannot parse target color "${targetValue}"`, fn);
  const targetL = lightnessOf(target);
  const top = best(
    colorPool(fn, scope, not, readableOn, readableContrast, by).filter((c) => onLightnessSide(direction, targetL, c.l)),
    (c) => contrastAgainst(target, c.color),
    'max',
  );
  if (!top) throw new FunctionError(`${fn}: no valid color candidates found in scope`, fn);
  return pick(scope, top.key);
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
    /** The field a text style is measured by: its font size unless given
     *  (`'fontWeight'`, `'lineHeight'`, …). Sizes and colors are measured as
     *  themselves. */
    by?: string;
    description?: string;
  },
): FunctionTokenValue {
  assertOptions('bestContrastWith', options, ['direction', 'not', 'by', ...READABLE_OPTIONS]);
  const fn = 'bestContrastWith';
  const scope = poolArg(fn, pool);
  valueArg(fn, targetValue);
  assertDirection(fn, options?.direction);
  return createFunctionToken(fn, [targetValue, scope], {
    description: options?.description,
    options: {
      not: toMembers(options?.not),
      ...(options?.direction ? { direction: options.direction } : {}),
      ...byOption(fn, options?.by),
      ...readableOnOptions(fn, options),
    },
    // A color, a size or a text style, as the target is.
    metadata: { dependencies: [], returnType: undefined },
  });
}
