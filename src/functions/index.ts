import { averageColorImpl } from './color/average-color';
import { bestContrastWithImpl } from './color/best-contrast';
import { closestColorImpl } from './color/closest-color';
import { colorMixImpl } from './color/color-mix';
import { darkenImpl } from './color/darken';
import { furthestFromImpl } from './color/furthest-from';
import { lightenImpl } from './color/lighten';
import { minContrastWithImpl } from './color/min-contrast';
import { mostVividImpl } from './color/most-vivid';
import { relativeToImpl } from './color/relative-to';
import { shadeImpl } from './color/shade';
import { nextLargerImpl } from './non-color/next-larger';
import { nextSmallerImpl } from './non-color/next-smaller';
import { spacingScaleImpl } from './non-color/spacing-scale';
import { timingImpl } from './non-color/timing';
import { typographyScaleImpl } from './non-color/typography-scale';
import type { Scope } from '../scope';

export { bestContrastWith } from './color/best-contrast';
export { minContrastWith } from './color/min-contrast';
export { colorMix } from './color/color-mix';
export { lighten } from './color/lighten';
export { darken } from './color/darken';
export { relativeTo } from './color/relative-to';
export { closestColor } from './color/closest-color';
export { furthestFrom } from './color/furthest-from';
export { averageColor } from './color/average-color';
export { mostVivid } from './color/most-vivid';
export { shade } from './color/shade';
export { spacingScale } from './non-color/spacing-scale';
export { typographyScale } from './non-color/typography-scale';
export { timing } from './non-color/timing';
export { nextLarger } from './non-color/next-larger';
export { nextSmaller } from './non-color/next-smaller';

export function registerBuiltinFunctions(book: {
	registerFunction<Args extends unknown[]>(name: string, impl: (...args: Args) => string): void;
}): void {
	book.registerFunction('bestContrastWith', (targetValue: string, scope: Scope, options?: { not?: string[] }) =>
		bestContrastWithImpl(targetValue, scope, options?.not ?? []),
	);
	book.registerFunction('minContrastWith', (targetValue: string, scope: Scope, options?: { ratio?: number; not?: string[] }) =>
		minContrastWithImpl(targetValue, scope, options?.ratio ?? 4.5, options?.not ?? []),
	);
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
	book.registerFunction('closestColor', (targetValue: string, scope: Scope, options?: { not?: string[] }) =>
		closestColorImpl(targetValue, scope, options?.not ?? []),
	);
	book.registerFunction('furthestFrom', (scope: Scope, options?: { not?: string[] }) =>
		furthestFromImpl(scope, options?.not ?? []),
	);
	book.registerFunction('averageColor', (scope: Scope, options?: { colorSpace?: string; not?: string[] }) =>
		averageColorImpl(scope, options?.colorSpace ?? 'lab', options?.not ?? []),
	);
	book.registerFunction(
		'mostVivid',
		(
			scope: Scope,
			againstOrOptions?: string | { minContrast?: number; not?: string[] },
			maybeOptions?: { minContrast?: number; not?: string[] },
		) => {
			const against = typeof againstOrOptions === 'string' ? againstOrOptions : null;
			const options = typeof againstOrOptions === 'string' ? maybeOptions : againstOrOptions;
			return mostVividImpl(scope, against, options?.minContrast ?? 0, options?.not ?? []);
		},
	);
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
		'nextLarger',
		(targetValue: string, scope: Scope, options?: { minDistance?: number; not?: string[] }) =>
			nextLargerImpl(targetValue, scope, options?.minDistance ?? 0, options?.not ?? []),
	);
	book.registerFunction(
		'nextSmaller',
		(targetValue: string, scope: Scope, options?: { minDistance?: number; not?: string[] }) =>
			nextSmallerImpl(targetValue, scope, options?.minDistance ?? 0, options?.not ?? []),
	);
}
