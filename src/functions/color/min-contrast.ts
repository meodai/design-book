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
import { contrastOn, contrastOption, contrastThreshold, targetIsOption } from './contrast';
import type { ContrastRole, ContrastThreshold } from './contrast';
import { readableOnOptions } from './readable';
import type { ReadableOnOptions } from './readable';
import type { ContrastInputs } from './best-contrast';
import { pick } from '../picks';
import type { Pick } from '../picks';

export interface MinContrastOptions extends ReadableOnOptions {
  /** The contrast to reach. For colors, in the book's method: a WCAG ratio
   *  (default 4.5) or an APCA Lc (default 60, the target as the background)
   *  — or a text style (`ref('type.body')`, `{ fontSize, fontWeight }`) the
   *  method turns into its minimum for that size and weight. For sizes and
   *  text styles, the ratio between the two (1.25 is a major third). */
  minContrast?: ContrastThreshold;
  /** Only candidates on that side of the target: 'lighter' / 'darker' for
   *  colors, 'larger' / 'smaller' for sizes and text styles. */
  direction?: Direction;
  /** Which side the target is when the book measures APCA, which scores
   *  text on a background differently from the reverse: 'background'
   *  (default, the members are text on it) or 'text' (the members are
   *  backgrounds for it). WCAG gives the same either way. */
  targetIs?: ContrastRole;
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
  options: ContrastInputs & { minContrast?: unknown },
): Pick {
  const fn = 'minContrastWith';
  const { not, direction, readableOn, readableContrast, minContrast, by, contrast = 'wcag', targetIs } = options;
  const measure = measureOf(targetValue, by);
  if (measure && readableOn !== undefined) {
    throw new FunctionError(`${fn}: \`readableOn\` is for colors; the target is a size or a text style`, fn);
  }
  if (measure && targetIs !== undefined) {
    throw new FunctionError(`${fn}: \`targetIs\` is for colors; the target is a size or a text style`, fn);
  }
  if (measure) {
    // Sizes and text styles: a plain ratio, whatever the book's method.
    const ratio = minContrast === undefined ? 4.5 : typeof minContrast === 'number' ? minContrast : Number(minContrast);
    if (!(ratio > 0)) {
      throw new FunctionError(`${fn}: \`minContrast\` against a size or a text style is a ratio, got ${String(minContrast)}`, fn);
    }
    return measuredContrast(fn, targetValue, measure, scope, measuredPool(scope, not, by), direction, { pick: 'min', minContrast: ratio });
  }
  assertDirectionFits(fn, direction, 'color');
  const target = parseColor(colorTarget(fn, targetValue, by));
  if (!target) throw new FunctionError(`${fn}: cannot parse target color "${targetValue}"`, fn);
  const targetL = lightnessOf(target);
  const candidates = colorPool(fn, scope, not, readableOn, readableContrast, by, contrast)
    .filter((c) => onLightnessSide(direction, targetL, c.l))
    .map((c) => ({ ...c, score: contrastOn(contrast, target, c.color, targetIs) }));
  if (candidates.length === 0) throw new FunctionError(`${fn}: no valid color candidates found in scope`, fn);
  const min = contrastThreshold(fn, 'minContrast', minContrast, contrast);
  const choice = best(candidates.filter((c) => c.score >= min - 1e-9), (c) => c.score, 'min')
    ?? best(candidates, (c) => c.score, 'max')!;
  return pick(scope, choice.key);
}

export function minContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: MinContrastOptions,
): FunctionTokenValue {
  assertOptions('minContrastWith', options, ['minContrast', 'direction', 'targetIs', 'not', 'by', ...READABLE_OPTIONS]);
  const fn = 'minContrastWith';
  const scope = poolArg(fn, pool);
  valueArg(fn, targetValue);
  const { not, description, direction, by } = options ?? {};
  assertDirection(fn, direction);
  // Kept as written: its default and its meaning depend on the book's method.
  const minContrast = contrastOption(fn, 'minContrast', options?.minContrast);
  return createFunctionToken(fn, [targetValue, scope], {
    description,
    options: { ...(minContrast !== undefined ? { minContrast } : {}), not: toMembers(not), ...(direction ? { direction } : {}), ...targetIsOption(fn, options?.targetIs), ...byOption(fn, by), ...readableOnOptions(fn, options) },
    // A color, a size or a text style, as the target is.
    metadata: { dependencies: [], returnType: undefined },
  });
}
