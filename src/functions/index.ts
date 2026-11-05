import { bestContrastWithImpl } from './color/best-contrast';
import { closestImpl } from './generic/closest';
import { largestImpl, smallestImpl } from './generic/extremes';
import type { Direction, Kind } from './kinds';
import { colorMixImpl } from './color/color-mix';
import { darkenImpl } from './color/darken';
import { furthestFromImpl } from './generic/furthest-from';
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
import { siblingImpl, scopeOfKey } from './generic/sibling';
import { excludedMembers, landIn, memberStart } from './members';
import type { Scope } from '../scope';
import type { AnyTokenValue } from '../tokens';
import { FunctionError } from '../errors';
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
export { furthestFrom } from './generic/furthest-from';
export type { FurthestFromOptions } from './generic/furthest-from';
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
export { picked } from './picks';
export type { SiblingOptions } from './generic/sibling';

export function registerBuiltinFunctions(book: {
	registerFunction<Args extends unknown[]>(name: string, impl: (...args: Args) => string): void;
	/** `sibling` looks up the scope its anchor key lives in. */
	getScope(name: string): Scope | undefined;
	/** A typography variant reads its base's fields. */
	resolve(key: string): string;
	getTokenByKey(key: string): AnyTokenValue | undefined;
}): void {
	// `not` names members wherever its keys are written; see ./members.
	const ex = (fn: string, scope: Scope, not: ReadonlyArray<unknown> | undefined) => excludedMembers(book, fn, scope, not ?? []);
	// The contrast selectors: (target, pool, readableOn?, options).
	book.registerFunction('bestContrastWith', (targetValue: string, scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ not?: string[]; direction?: Direction; readableContrast?: number }>(rest);
		return bestContrastWithImpl(targetValue, scope, ex('bestContrastWith', scope, options.not), options.direction, readableOn, options.readableContrast);
	});
	book.registerFunction('minContrastWith', (targetValue: string, scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ minContrast?: number; not?: string[]; direction?: Direction; readableContrast?: number }>(rest);
		return minContrastWithImpl(targetValue, scope, options.minContrast ?? 4.5, ex('minContrastWith', scope, options.not), options.direction, readableOn, options.readableContrast);
	});
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
		// [upTo?, readableOn?, options]: options.upTo marks the upTo argument.
		const marked = rest[rest.length - 1] as { upTo?: unknown } | undefined;
		const upTo = marked?.upTo === true ? rest.shift() as string : undefined;
		const { readableOn, options } = splitReadableArgs<{
			not?: string[]; readableContrast?: number; direction?: Direction; minDistance?: number;
		}>(rest);
		return closestImpl(targetValue, scope, ex('closest', scope, options.not), readableOn, options.readableContrast, {
			direction: options.direction, upTo, minDistance: options.minDistance,
		});
	});
	book.registerFunction('furthestFrom', (targetValue: string, scope: Scope, ...rest: unknown[]) => {
		const { readableOn, options } = splitReadableArgs<{ not?: string[]; readableContrast?: number; maxDistance?: number }>(rest);
		return furthestFromImpl(targetValue, scope, ex('furthestFrom', scope, options.not), readableOn, options.readableContrast, options.maxDistance);
	});
	book.registerFunction('largest', (scope: Scope, options?: { not?: string[]; type?: 'size' | 'text' }) => largestImpl(scope, { ...options, not: ex('largest', scope, options?.not) }));
	book.registerFunction('smallest', (scope: Scope, options?: { not?: string[]; type?: 'size' | 'text' }) => smallestImpl(scope, { ...options, not: ex('smallest', scope, options?.not) }));
	// The targetless pool selectors share one shape: (pool, readableOn?, options).
	const poolSelectors: Array<[string, (scope: Scope, not: string[], readableOn: string | null, readableContrast?: number, type?: Kind) => string]> = [
		['mostVivid', mostVividImpl],
		['leastVivid', leastVividImpl],
		['lightest', lightestImpl],
		['darkest', darkestImpl],
	];
	for (const [name, impl] of poolSelectors) {
		book.registerFunction(name, (scope: Scope, ...rest: unknown[]) => {
			const { readableOn, options } = splitReadableArgs<{ not?: string[]; readableContrast?: number; type?: Kind }>(rest);
			return impl(scope, ex(name, scope, options.not), readableOn, options.readableContrast, options.type);
		});
	}

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
		// (scope?, options): the scope argument, when given, is the scale walked.
		(...args: unknown[]) => {
			const options = args[args.length - 1] as { from?: unknown; offset?: number; wrap?: boolean; not?: unknown[]; toward?: unknown } | undefined;
			const pool = args.length > 1 ? (args[0] as Scope | undefined) : undefined;
			if (!options || options.from === undefined) {
				throw new FunctionError('sibling: a fully-qualified `from` key is required', 'sibling');
			}
			const unreadable = (options.from as { unresolvable?: string }).unresolvable;
			if (unreadable) throw new FunctionError(`sibling: ${unreadable}`, 'sibling');
			if (!Number.isInteger(options.offset)) {
				throw new FunctionError(`sibling: offset must be an integer, got ${options.offset}`, 'sibling');
			}
			// The anchor as written, a `source` followed.
			const start = memberStart(book, 'sibling', options.from);
			if (start === undefined || !start.includes('.')) {
				throw new FunctionError('sibling: a fully-qualified `from` key is required', 'sibling');
			}
			// The scale: the scope argument (the anchor's references followed into
			// it), or the anchor's own scope.
			const scope = pool ?? book.getScope(scopeOfKey(start));
			if (!scope) throw new FunctionError(`sibling: unknown scope "${scopeOfKey(start)}"`, 'sibling');
			const anchor = landIn(book, start, scope.name);
			if (anchor === undefined) {
				throw new FunctionError(`sibling: "${start}" is not in "${scope.name}" and its references do not lead into it`, 'sibling');
			}
			// The target is read against the same scale, like a `not` entry.
			let toward: string | undefined;
			if (options.toward !== undefined) {
				const reason = (options.toward as { unresolvable?: string }).unresolvable;
				if (reason) throw new FunctionError(`sibling: \`toward\` could not be read: ${reason}`, 'sibling');
				const target = memberStart(book, 'sibling', options.toward);
				toward = target === undefined ? undefined : landIn(book, target, scope.name);
				if (toward === undefined) {
					throw new FunctionError(`sibling: \`toward\` "${target}" is not in "${scope.name}" and its references do not lead into it`, 'sibling');
				}
			}
			return siblingImpl(scope, anchor, options.offset as number, options.wrap ?? false, ex('sibling', scope, options.not), toward);
		},
	);
}
