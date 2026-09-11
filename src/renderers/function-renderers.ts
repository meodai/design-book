import { keyToHyphen } from './renderer';
import type { FunctionRendererOptions, Renderer } from './renderer';
import { isFunctionTokenValue, isReferenceValue, isTokenValue } from '../tokens';
import { toCssColorSpace } from '../functions/color/color-mix';
import {
  RELATIVE_TO_CSS_SCALES,
  relativeToChannels,
} from '../functions/color/relative-to';
import type { FunctionArg, ReferenceValue, TokenValue } from '../tokens';

/** Convert a single function argument into a CSS expression. Nested
 *  function tokens are handed back to the renderer so they render through
 *  the function-renderer registry (or their resolved value) rather than
 *  stringifying to `[object Object]`. */
function argToCssValue(renderer: Renderer, arg: FunctionArg): string {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number') return String(arg);
  if (isReferenceValue(arg)) {
    const ref = arg as ReferenceValue;
    return `var(--${keyToHyphen(ref.key)})`;
  }
  if (isFunctionTokenValue(arg)) {
    return renderer.renderFunctionToken(arg);
  }
  if (isTokenValue(arg)) {
    const tv = arg as TokenValue;
    if (tv.metadata?.unit) return `${tv.rawValue}${tv.metadata.unit}`;
    return String(tv.rawValue);
  }
  return String(arg);
}

/** Trim binary-float noise (0.1 * 255 → 25.500000000000004) without
 *  rounding away meaningful precision. */
function formatNumber(value: number): string {
  return String(Number(value.toPrecision(10)));
}

function getOptions<T extends FunctionRendererOptions>(options?: FunctionRendererOptions): T | undefined {
  return options as T | undefined;
}

export function registerBuiltinFunctionRenderers(renderer: Renderer): void {
  const css = (arg: FunctionArg): string => argToCssValue(renderer, arg);

  // --- Functions WITHOUT scope (pure transforms) ---

  // colorMix(color1, color2, options?)
  renderer.registerFunctionRenderer('colorMix', (args, options) => {
    const colorMixOptions = getOptions<{ ratio?: number; colorSpace?: string }>(options);
    const color1 = css(args[0]);
    const color2 = css(args[1]);
    const ratio = colorMixOptions?.ratio ?? 0.5;
    const colorSpace = toCssColorSpace(colorMixOptions?.colorSpace ?? 'lab');
    const pct = Math.round((1 - ratio) * 100);
    return `color-mix(in ${colorSpace}, ${color1} ${pct}%, ${color2})`;
  });

  // lighten(color, options?)
  renderer.registerFunctionRenderer('lighten', (args, options) => {
    const lightenOptions = getOptions<{ amount?: number }>(options);
    const color = css(args[0]);
    const amount = lightenOptions?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, white)`;
  });

  // darken(color, options?)
  renderer.registerFunctionRenderer('darken', (args, options) => {
    const darkenOptions = getOptions<{ amount?: number }>(options);
    const color = css(args[0]);
    const amount = darkenOptions?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, black)`;
  });

  // relativeTo(color, colorSpace, modifications, options?)
  // CSS relative-colour syntax: `<space>(from <color> <ch> <ch> <ch>)`.
  // `color(from …)` is rejected by browsers for these spaces.
  renderer.registerFunctionRenderer('relativeTo', (args, options) => {
    const relativeToOptions = getOptions<{
      colorSpace?: string;
      modifications?: (null | number | string)[];
    }>(options);
    const color = css(args[0]);
    const colorSpace = relativeToOptions?.colorSpace ?? 'oklch';
    const modifications: (null | number | string)[] = relativeToOptions?.modifications ?? [];

    const channels = relativeToChannels(colorSpace);
    const scales = RELATIVE_TO_CSS_SCALES[colorSpace];

    const channelExprs = channels.map((ch, i) => {
      const mod = modifications[i];
      if (mod === null || mod === undefined) return ch;
      // Absolute values and +/- deltas live in Culori's channel range, so
      // they are scaled into the CSS one. Factors for * and / are ratios
      // and stay as written.
      if (typeof mod === 'number') return formatNumber(mod * scales[i]);
      const op = mod[0];
      if (op === '+' || op === '-') {
        return `calc(${ch} ${op} ${formatNumber(parseFloat(mod.slice(1)) * scales[i])})`;
      }
      if (op === '*' || op === '/') {
        return `calc(${ch} ${op} ${mod.slice(1)})`;
      }
      return formatNumber(parseFloat(mod) * scales[i]);
    });

    return `${colorSpace}(from ${color} ${channelExprs.join(' ')})`;
  });

  // spacingScale(base, options?)
  renderer.registerFunctionRenderer('spacingScale', (args, options) => {
    const spacingScaleOptions = getOptions<{ multiplier?: number }>(options);
    const base = css(args[0]);
    const multiplier = spacingScaleOptions?.multiplier ?? 1;
    if (multiplier === 1) return base;
    return `calc(${base} * ${multiplier})`;
  });

  // typographyScale(base, options?)
  renderer.registerFunctionRenderer('typographyScale', (args, options) => {
    const typographyScaleOptions = getOptions<{ ratio?: number; step?: number }>(options);
    const base = css(args[0]);
    const ratio = typographyScaleOptions?.ratio ?? 1.25;
    const step = typographyScaleOptions?.step ?? 0;
    if (step === 0) return base;
    const factor = Math.round(Math.pow(ratio, step) * 10000) / 10000;
    return `calc(${base} * ${factor})`;
  });

  // timing(duration, easing, options?)
  renderer.registerFunctionRenderer('timing', (args, options) => {
    const timingOptions = getOptions<{ delay?: number }>(options);
    const duration = css(args[0]);
    const easing = typeof args[1] === 'string' ? args[1] : String(args[1]);
    const delay = timingOptions?.delay;
    if (delay) return `${duration} ${easing} ${delay}ms`;
    return `${duration} ${easing}`;
  });

  // --- Functions WITH scope (resolve to computed value in CSS since
  //     there's no CSS equivalent for "pick best contrast from a set") ---
  //     These fall through to the default resolved-value behavior in the renderer.
  //     No need to register them — the renderer already resolves the value.
}
