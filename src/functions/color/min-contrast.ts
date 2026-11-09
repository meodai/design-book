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
import type { ReadableOnOptions } from './readable';
import type { ContrastInputs } from './best-contrast';
import { pick } from '../picks';
import type { Pick } from '../picks';

export interface MinContrastOptions extends ReadableOnOptions {
  /** The contrast to reach: a WCAG ratio for colors (default 4.5), the ratio
   *  between two sizes or font sizes for sizes and text styles (1.25 is a
   *  major third). The same name as on the color selectors' `readableOn`. */
  minContrast?: number;
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
}

/** The member that just reaches `minContrast` against the target — the
 *  lowest contrast at or above it — or, when none does, the highest. */
export function minContrastWithImpl(
  targetValue: Measurable,
  scope: Scope,
  options: ContrastInputs & { minContrast?: number },
): Pick {
  const fn = 'minContrastWith';
  const { not, direction, readableOn, readableContrast, minContrast = 4.5, by } = options;
  const measure = measureOf(targetValue, by);
  if (measure && readableOn !== undefined) {
    throw new FunctionError(`${fn}: \`readableOn\` is for colors; the target is a size or a text style`, fn);
  }
  if (measure) {
    return measuredContrast(fn, targetValue, measure, scope, measuredPool(scope, not, by), direction, { pick: 'min', minContrast });
  }
  assertDirectionFits(fn, direction, 'color');
  const target = parseColor(colorTarget(fn, targetValue, by));
  if (!target) throw new FunctionError(`${fn}: cannot parse target color "${targetValue}"`, fn);
  const targetL = lightnessOf(target);
  const candidates = colorPool(fn, scope, not, readableOn, readableContrast, by)
    .filter((c) => onLightnessSide(direction, targetL, c.l))
    .map((c) => ({ ...c, contrast: contrastAgainst(target, c.color) }));
  if (candidates.length === 0) throw new FunctionError(`${fn}: no valid color candidates found in scope`, fn);
  const choice = best(candidates.filter((c) => c.contrast >= minContrast), (c) => c.contrast, 'min')
    ?? best(candidates, (c) => c.contrast, 'max')!;
  return pick(scope, choice.key);
}

export function minContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: MinContrastOptions,
): FunctionTokenValue {
  assertOptions('minContrastWith', options, ['minContrast', 'direction', 'not', 'by', ...READABLE_OPTIONS]);
  const fn = 'minContrastWith';
  const scope = poolArg(fn, pool);
  valueArg(fn, targetValue);
  const { minContrast = 4.5, not, description, direction, by } = options ?? {};
  assertDirection(fn, direction);
  if (typeof minContrast !== 'number' || !(minContrast > 0)) {
    throw new FunctionError(`${fn}: \`minContrast\` must be a positive number, got ${String(minContrast)}`, fn);
  }
  return createFunctionToken(fn, [targetValue, scope], {
    description,
    options: { minContrast, not: toMembers(not), ...(direction ? { direction } : {}), ...byOption(fn, by), ...readableOnOptions(fn, options) },
    // A color, a size or a text style, as the target is.
    metadata: { dependencies: [], returnType: undefined },
  });
}
