import { byOption } from '../kinds';
import { poolArg, assertOptions, READABLE_OPTIONS } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, toMembers } from '../../tokens';
import type { FunctionTokenValue, MemberReference, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { best, colorPool } from '../pool';
import { readableOnOptions } from './readable';
import type { ReadableOn, ReadableOnOptions } from './readable';
import { picked } from '../picks';

/**
 * `lightest` / `darkest`: the color at one end of the OKLCH lightness axis.
 * OKLCH L rather than HSL lightness, which calls #ffff00 and #0000ff equally
 * light, and rather than WCAG luminance, which is a contrast measure and not
 * perceptually uniform. Ties go to the first candidate in scope order.
 *
 * Alpha is not factored in: there is no backdrop to composite over, so a
 * translucent candidate is ranked by the lightness of its color and
 * returned with its alpha intact. (`readableOn` does composite, but only to
 * decide which candidates stay in the pool.)
 */
type End = 'lightest' | 'darkest';

/** The options as the implementation receives them. */
export interface LightnessInputs extends ReadableOn {
  /** Qualified member keys left out (the registry has read `not`). */
  not: string[];
  /** The color field text styles are compared by. */
  by?: string;
}

function endImpl(fn: End, scope: Scope, options: LightnessInputs): string {
  const pick = best(colorPool(fn, scope, options.not, options.readableOn, options.readableContrast, options.by), (c) => c.l, fn === 'lightest' ? 'max' : 'min');
  if (!pick) throw new FunctionError(`${fn}: no valid color candidates found in scope`, fn);
  return picked(scope, pick.key, pick.value);
}

export function lightestImpl(scope: Scope, options: LightnessInputs): string {
  return endImpl('lightest', scope, options);
}

export function darkestImpl(scope: Scope, options: LightnessInputs): string {
  return endImpl('darkest', scope, options);
}

export interface LightnessSelectorOptions extends ReadableOnOptions {
  /** Keys to exclude from the candidate pool: `ref('scope.token')` or a
   *  literal `'scope.token'` string. */
  not?: ReadonlyArray<string | ReferenceValue | MemberReference>;
  /** A text style's color field to compare it by (`'color'`); without it
   *  text styles are no candidates. The pick is the whole style. */
  by?: string;
  description?: string;
}

function build(fn: End, pool: PoolArg, options?: LightnessSelectorOptions): FunctionTokenValue {
  assertOptions(fn, options, ['not', 'by', ...READABLE_OPTIONS]);
  const scope = poolArg(fn, pool);
  return createFunctionToken(fn, [scope], {
    description: options?.description,
    options: { not: toMembers(options?.not), ...byOption(fn, options?.by), ...readableOnOptions(fn, options) },
    // With `by`, the pick may be a text style.
    metadata: { dependencies: [], returnType: options?.by === undefined ? 'color' : undefined },
  });
}

/** The color in `scope` with the highest OKLCH lightness. */
export function lightest(scope: PoolArg, options?: LightnessSelectorOptions): FunctionTokenValue {
  return build('lightest', scope, options);
}

/** The color in `scope` with the lowest OKLCH lightness. */
export function darkest(scope: PoolArg, options?: LightnessSelectorOptions): FunctionTokenValue {
  return build('darkest', scope, options);
}
