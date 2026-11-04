import { bestContrastWithImpl } from './color/best-contrast';
import { closestImpl } from './generic/closest';
import { largestImpl, smallestImpl } from './generic/extremes';
import type { Direction, Kind } from './kinds';
import { colorMixImpl } from './color/color-mix';
import { darkenImpl } from './color/darken';
import { furthestFromImpl } from './color/furthest-from';
import { leastVividImpl } from './color/least-vivid';
import { lightestImpl, darkestImpl } from './color/lightest-darkest';
import { lightenImpl } from './color/lighten';
import { minContrastWithImpl } from './color/min-contrast';
import { mostVividImpl } from './color/most-vivid';
import { relativeToImpl } from './color/relative-to';
import { shadeImpl } from './color/shade';
import { spacingScaleImpl } from './non-color/spacing-scale';
import { timingImpl } from './non-color/timing';
import { typographyScaleImpl } from './non-color/typography-scale';
import { typographyImpl } from './non-color/typography';
import { randomImpl } from './generic/random';
import type { RandomType } from './generic/random';
import { nthImpl } from './generic/nth';
import { locateMember, siblingImpl, scopeOfKey } from './generic/sibling';
import type { Scope } from '../scope';
import type { AnyTokenValue } from '../tokens';
import { FunctionError } from '../errors';
import { excludedMembers } from './not';
import { splitReadableArgs } from './color/readable';

export { bestContrastWith } from './color/best-contrast';
export { minContrastWith } from './color/min-contrast';
export { colorMix } from './color/color-mix';
export { lighten } from './color/lighten';
export { darken } from './color/darken';
export { relativeTo } from './color/relative-to';
export { closest, nextLarger, nextSmaller, nextLighter, nextDarker } from './generic/closest';
export type { ClosestOptions, NextOptions } from './generic/closest';
export { largest, smallest } from './generic/extremes';
export type { ExtremeOptions } from './generic/extremes';
export { furthestFrom } from './color/furthest-from';
export { mostVivid } from './color/most-vivid';
export { leastVivid } from './color/least-vivid';
export { lightest, darkest } from './color/lightest-darkest';
export type { LightnessSelectorOptions } from './color/lightest-darkest';
export type { ReadableOnOptions } from './color/readable';
export { shade } from './color/shade';
export { ramp, rampStops } from './color/ramp';
export { spacingScale } from './non-color/spacing-scale';
export { typographyScale } from './non-color/typography-scale';
export { typography, variant, isTypographyToken, typographyFields, typographyFieldNames, typographyBase } from './non-color/typography';
export type { TypographyField, TypographyFields, TypographyOverrides } from './non-color/typography';
export { timing } from './non-color/timing';
export { random } from './generic/random';
export type { RandomOptions, RandomType } from './generic/random';
export { nth } from './generic/nth';
export type { NthOptions } from './generic/nth';
export { sibling } from './generic/sibling';
export type { SiblingOptions } from './generic/sibling';

export function registerBuiltinFunctions(book: {
	registerFunction<Args extends unknown[]>(name: string, impl: (...args: Args) => string): void;
	/** `sibling` looks up the scope its anchor key lives in. */
	getScope(name: string): Scope | undefined;
	/** A typography variant reads its base's fields. */
	resolve(key: string): string;
	getTokenByKey(key: string): AnyTokenValue | undefined;
}): void {
	// `not` names members wherever its keys are written; see ./not.
	const ex = (fn: string, scope: Scope, not: ReadonlyArray<unknown> | undefined) => excludedMembers(book, fn, scope, not ?? []);
	book.registerFunction('bestContrastWith', (targetValue: string, scope: Scope, options?: { not?: string[]; direction?: Direction }) =>
		bestContrastWithImpl(targetValue, scope, ex('bestContrastWith', scope, options?.not), options?.direction),
	);
	book.registerFunction('minContrastWith', (targetValue: string, scope: Scope, options?: { ratio?: number; not?: string[]; direction?: Direction }) =>
		minContrastWithImpl(targetValue, scope, options?.ratio ?? 4.5, ex('minContrastWith', scope, options?.not), options?.direction),
	);
	book.registerFunction('typography', (...args: unknown[]) => typographyImpl(book, ...args));
	book.registerFunction('colorMix', (color1: string, color2: string, options?: { ratio?: number; colorSpace?: string }) =>
		colorMixImpl(color1, color2, options?.ratio ?? 0.5, options?.colorSpace ?? 'lab'),
	);
	book.registerFunction('lighten', (colorValue: string, options?: { amount?: number }) =>
		lightenImpl(colorValue, options?.amount ?? 0.1),
	);
	book.registerFunction('darken', (colorValue: string, options?: { amount?: number }) =>
		darkenImpl(colorValue, options?.amount ?? 0.1),
	);
	book.registerFunction('relativeTo', (baseColor: string, options?: { colorSpace?: string; modifications?: (null | number | string)[] }) =>
		relativeToImpl(baseColor, options?.colorSpace ?? 'oklch', options?.modifications ?? [null, null, null]),
	);
	book.registerFunction('closest', (targetValue: string, scope: Scope, ...rest: unknown[]) => {
		// [toward?, readableOn?, options]: options.toward marks the toward argument.
		const marked = rest[rest.length - 1] as { toward?: unknown } | undefined;
		const toward = marked?.toward === true ? rest.shift() as string : undefined;
		const { readableOn, options } = splitReadableArgs<{
			not?: string[]; minContrast?: number; direction?: Direction; minDistance?: number;
		}>(rest);
		return closestImpl(targetValue, scope, ex('closest', scope, options.not), readableOn, options.minContrast, {
			direction: options.direction, toward, minDistance: options.minDistance,
		});
	});
	book.registerFunction('largest', (scope: Scope, options?: { not?: string[]; type?: 'size' | 'text' }) => largestImpl(scope, { ...options, not: ex('largest', scope, options?.not) }));
	book.registerFunction('smallest', (scope: Scope, options?: { not?: string[]; type?: 'size' | 'text' }) => smallestImpl(scope, { ...options, not: ex('smallest', scope, options?.not) }));
	book.registerFunction('furthestFrom', (scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ not?: string[]; minContrast?: number; type?: Kind }>(rest);
		return furthestFromImpl(scope, ex('furthestFrom', scope, options.not), readableOn, options.minContrast, options.type);
	});
	book.registerFunction('mostVivid', (scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ not?: string[]; minContrast?: number }>(rest);
		return mostVividImpl(scope, ex('mostVivid', scope, options.not), readableOn, options.minContrast);
	});
	book.registerFunction('leastVivid', (scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ not?: string[]; minContrast?: number }>(rest);
		return leastVividImpl(scope, ex('leastVivid', scope, options.not), readableOn, options.minContrast);
	});
	book.registerFunction('lightest', (scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ not?: string[]; minContrast?: number }>(rest);
		return lightestImpl(scope, ex('lightest', scope, options.not), readableOn, options.minContrast);
	});
	book.registerFunction('darkest', (scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ not?: string[]; minContrast?: number }>(rest);
		return darkestImpl(scope, ex('darkest', scope, options.not), readableOn, options.minContrast);
	});

	book.registerFunction('shade', (colorValue: string, options?: { amount?: number }) =>
		shadeImpl(colorValue, options?.amount ?? 0.1),
	);
	book.registerFunction('spacingScale', (baseValue: string, options?: { multiplier?: number }) =>
		spacingScaleImpl(baseValue, options?.multiplier ?? 1),
	);
	book.registerFunction('typographyScale', (baseValue: string, options?: { ratio?: number; step?: number }) =>
		typographyScaleImpl(baseValue, options?.ratio ?? 1.25, options?.step ?? 0),
	);
	book.registerFunction('timing', (duration: string, easing: string, options?: { delay?: number }) =>
		timingImpl(duration, easing, options?.delay ?? 0),
	);
	book.registerFunction(
		'random',
		(scope: Scope, options?: { type: RandomType; seed: number | string; not?: string[] }) => {
			if (!options) {
				throw new FunctionError('random: options are required', 'random');
			}
			if (options.type === undefined || options.type === null) {
				throw new FunctionError('random: options.type is required', 'random');
			}
			if (
				options.seed === undefined
				|| options.seed === null
				|| (typeof options.seed !== 'number' && typeof options.seed !== 'string')
			) {
				throw new FunctionError(
					`random: options.seed must be a number or string, got ${typeof options.seed}`,
					'random',
				);
			}
			return randomImpl(scope, options.type, options.seed, ex('random', scope, options.not));
		},
	);
	book.registerFunction(
		'nth',
		(scope: Scope, options?: { index: number; not?: string[] }) => {
			if (!options || options.index === undefined) {
				throw new FunctionError('nth: index option is required', 'nth');
			}
			if (!Number.isFinite(options.index)) {
				throw new FunctionError(
					`nth: index must be a finite number, got ${options.index}`,
					'nth',
				);
			}
			return nthImpl(scope, options.index, ex('nth', scope, options.not));
		},
	);
	book.registerFunction(
		'sibling',
		(options?: { from?: unknown; offset?: number; wrap?: boolean; not?: string[]; toward?: unknown }) => {
			if (!options || typeof options.from !== 'string' || !options.from.includes('.')) {
				const reason = (options?.from as { unresolvable?: string } | undefined)?.unresolvable;
				throw new FunctionError(reason ? `sibling: ${reason}` : 'sibling: a fully-qualified `from` key is required', 'sibling');
			}
			if (!Number.isInteger(options.offset)) {
				throw new FunctionError(`sibling: offset must be an integer, got ${options.offset}`, 'sibling');
			}
			const anchorScope = scopeOfKey(options.from);
			if (!book.getScope(anchorScope)) {
				throw new FunctionError(`sibling: unknown scope "${anchorScope}"`, 'sibling');
			}
			// Step along the scale the anchor's color lives on.
			const anchor = locateMember(book, options.from);
			if (!anchor) {
				throw new FunctionError(`sibling: the value of "${options.from}" is not a member of any scope, so there is nothing to step along`, 'sibling');
			}
			const scope = book.getScope(anchor.scope);
			if (!scope) {
				throw new FunctionError(`sibling: unknown scope "${anchor.scope}"`, 'sibling');
			}
			let toward: string | undefined;
			if (options.toward !== undefined) {
				if (typeof options.toward !== 'string') {
					const reason = (options.toward as { unresolvable?: string }).unresolvable;
					throw new FunctionError(`sibling: \`toward\` could not be read${reason ? `: ${reason}` : ''}`, 'sibling');
				}
				const target = locateMember(book, options.toward);
				if (!target || target.scope !== anchor.scope) {
					throw new FunctionError(
						`sibling: "${options.toward}" is ${target ? `in "${target.scope}"` : 'not a member of any scope'}, but "${options.from}" steps along "${anchor.scope}"`,
						'sibling',
					);
				}
				toward = target.key;
			}
			return siblingImpl(scope, anchor.key, options.offset as number, options.wrap ?? false, ex('sibling', scope, options.not), toward);
		},
	);
}
