import type { FunctionRendererOptions, Renderer } from './renderer';
import { isReferenceValue, isTokenValue } from '../tokens';
import type { FunctionArg, ReferenceValue, TokenValue } from '../tokens';

function argToCssValue(arg: FunctionArg): string {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number') return String(arg);
  if (isReferenceValue(arg)) {
    const ref = arg as ReferenceValue;
    return `var(--${ref.key.replace(/[._]/g, '-')})`;
  }
  if (isTokenValue(arg)) {
    const tv = arg as TokenValue;
    if (tv.metadata?.unit) return `${tv.rawValue}${tv.metadata.unit}`;
    return String(tv.rawValue);
  }
  return String(arg);
}

function getOptions<T extends FunctionRendererOptions>(options?: FunctionRendererOptions): T | undefined {
  return options as T | undefined;
}

export function registerBuiltinFunctionRenderers(renderer: Renderer): void {
  // --- Functions WITHOUT scope (pure transforms) ---

  // colorMix(color1, color2, options?)
  renderer.registerFunctionRenderer('colorMix', (args, options) => {
    const colorMixOptions = getOptions<{ ratio?: number; colorSpace?: string }>(options);
    const color1 = argToCssValue(args[0]);
    const color2 = argToCssValue(args[1]);
    const ratio = colorMixOptions?.ratio ?? 0.5;
    const colorSpace = colorMixOptions?.colorSpace ?? 'lab';
    const pct = Math.round((1 - ratio) * 100);
    return `color-mix(in ${colorSpace}, ${color1} ${pct}%, ${color2})`;
  });

  // lighten(color, options?)
  renderer.registerFunctionRenderer('lighten', (args, options) => {
    const lightenOptions = getOptions<{ amount?: number }>(options);
    const color = argToCssValue(args[0]);
    const amount = lightenOptions?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, white)`;
  });

  // darken(color, options?)
  renderer.registerFunctionRenderer('darken', (args, options) => {
    const darkenOptions = getOptions<{ amount?: number }>(options);
    const color = argToCssValue(args[0]);
    const amount = darkenOptions?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, black)`;
  });

  // relativeTo(color, colorSpace, modifications, options?)
  // CSS: color(from <color> <space> <channel-exprs>)
  renderer.registerFunctionRenderer('relativeTo', (args, options) => {
    const relativeToOptions = getOptions<{
      colorSpace?: string;
      modifications?: (null | number | string)[];
    }>(options);
    const color = argToCssValue(args[0]);
    // colorSpace and modifications are captured in closure, passed via options
    const colorSpace = relativeToOptions?.colorSpace ?? 'oklch';
    const modifications: (null | number | string)[] = relativeToOptions?.modifications ?? [null, null, null];

    // Map color space to channel names
    const channelNames: Record<string, string[]> = {
      oklch: ['l', 'c', 'h'],
      hsl: ['h', 's', 'l'],
      lab: ['l', 'a', 'b'],
      lch: ['l', 'c', 'h'],
      rgb: ['r', 'g', 'b'],
    };
    const channels = channelNames[colorSpace] ?? ['l', 'c', 'h'];

    const channelExprs = channels.map((ch, i) => {
      const mod = modifications[i];
      if (mod === null || mod === undefined) return ch;
      if (typeof mod === 'number') return String(mod);
      // String modifier: "+180", "-0.2", "*0.5", "/2"
      const op = mod[0];
      const val = mod.slice(1);
      return `calc(${ch} ${op} ${val})`;
    });

    return `color(from ${color} ${colorSpace} ${channelExprs.join(' ')})`;
  });

  // spacingScale(base, options?)
  renderer.registerFunctionRenderer('spacingScale', (args, options) => {
    const spacingScaleOptions = getOptions<{ multiplier?: number }>(options);
    const base = argToCssValue(args[0]);
    const multiplier = spacingScaleOptions?.multiplier ?? 1;
    if (multiplier === 1) return base;
    return `calc(${base} * ${multiplier})`;
  });

  // typographyScale(base, options?)
  renderer.registerFunctionRenderer('typographyScale', (args, options) => {
    const typographyScaleOptions = getOptions<{ ratio?: number; step?: number }>(options);
    const base = argToCssValue(args[0]);
    const ratio = typographyScaleOptions?.ratio ?? 1.25;
    const step = typographyScaleOptions?.step ?? 0;
    if (step === 0) return base;
    const factor = Math.round(Math.pow(ratio, step) * 10000) / 10000;
    return `calc(${base} * ${factor})`;
  });

  // timing(duration, easing, options?)
  renderer.registerFunctionRenderer('timing', (args, options) => {
    const timingOptions = getOptions<{ delay?: number }>(options);
    const duration = argToCssValue(args[0]);
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
