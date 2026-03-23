import { averageColorImpl } from './color/average-color';
import { bestContrastWithImpl } from './color/best-contrast';
import { closestColorImpl } from './color/closest-color';
import { colorMixImpl } from './color/color-mix';
import { darkenImpl } from './color/darken';
import { furthestFromImpl } from './color/furthest-from';
import { lightenImpl } from './color/lighten';
import { minContrastWithImpl } from './color/min-contrast';
import { relativeToImpl } from './color/relative-to';
import { spacingScaleImpl } from './non-color/spacing-scale';
import { timingImpl } from './non-color/timing';
import { typographyScaleImpl } from './non-color/typography-scale';

export { bestContrastWith } from './color/best-contrast';
export { minContrastWith } from './color/min-contrast';
export { colorMix } from './color/color-mix';
export { lighten } from './color/lighten';
export { darken } from './color/darken';
export { relativeTo } from './color/relative-to';
export { closestColor } from './color/closest-color';
export { furthestFrom } from './color/furthest-from';
export { averageColor } from './color/average-color';
export { spacingScale } from './non-color/spacing-scale';
export { typographyScale } from './non-color/typography-scale';
export { timing } from './non-color/timing';

export function registerBuiltinFunctions(book: {
	registerFunction(name: string, impl: (...args: any[]) => string): void;
}): void {
	book.registerFunction('bestContrastWith', (targetValue: string, scope: any) =>
		bestContrastWithImpl(targetValue, scope),
	);
	book.registerFunction('minContrastWith', (targetValue: string, scope: any, options?: { ratio?: number }) =>
		minContrastWithImpl(targetValue, scope, options?.ratio ?? 4.5),
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
	book.registerFunction('closestColor', (targetValue: string, scope: any) =>
		closestColorImpl(targetValue, scope),
	);
	book.registerFunction('furthestFrom', (scope: any) => furthestFromImpl(scope));
	book.registerFunction('averageColor', (scope: any, options?: { colorSpace?: string }) =>
		averageColorImpl(scope, options?.colorSpace ?? 'lab'),
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
}
