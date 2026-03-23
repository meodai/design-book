import type { Renderer } from './renderer';
import type { ReferenceValue, TokenValue } from '../tokens';

function argToCssValue(arg: any): string {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number') return String(arg);
  if (typeof arg === 'object' && arg !== null) {
    if (arg.type === 'reference') {
      const ref = arg as ReferenceValue;
      return `var(--${ref.key.replace(/[._]/g, '-')})`;
    }
    if ('rawValue' in arg) {
      const tv = arg as TokenValue;
      if (tv.metadata?.unit) return `${tv.rawValue}${tv.metadata.unit}`;
      return String(tv.rawValue);
    }
  }
  return String(arg);
}

export function registerBuiltinFunctionRenderers(renderer: Renderer): void {
  // --- Functions WITHOUT scope (pure transforms) ---

  // colorMix(color1, color2, options?)
  renderer.registerFunctionRenderer('colorMix', (args, options) => {
    const color1 = argToCssValue(args[0]);
    const color2 = argToCssValue(args[1]);
    const ratio = options?.ratio ?? 0.5;
    const colorSpace = options?.colorSpace ?? 'lab';
    const pct = Math.round((1 - ratio) * 100);
    return `color-mix(in ${colorSpace}, ${color1} ${pct}%, ${color2})`;
  });

  // lighten(color, options?)
  renderer.registerFunctionRenderer('lighten', (args, options) => {
    const color = argToCssValue(args[0]);
    const amount = options?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, white)`;
  });

  // darken(color, options?)
  renderer.registerFunctionRenderer('darken', (args, options) => {
    const color = argToCssValue(args[0]);
    const amount = options?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, black)`;
  });

  // relativeTo(color, colorSpace, modifications, options?)
  // CSS: color(from <color> <space> <channel-exprs>)
  renderer.registerFunctionRenderer('relativeTo', (args, options) => {
    const color = argToCssValue(args[0]);
    // colorSpace and modifications are captured in closure, passed via options
    const colorSpace = options?.colorSpace ?? 'oklch';
    const modifications: (null | number | string)[] = options?.modifications ?? [null, null, null];

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
    const base = argToCssValue(args[0]);
    const multiplier = options?.multiplier ?? 1;
    if (multiplier === 1) return base;
    return `calc(${base} * ${multiplier})`;
  });

  // typographyScale(base, options?)
  renderer.registerFunctionRenderer('typographyScale', (args, options) => {
    const base = argToCssValue(args[0]);
    const ratio = options?.ratio ?? 1.25;
    const step = options?.step ?? 0;
    if (step === 0) return base;
    const factor = Math.round(Math.pow(ratio, step) * 10000) / 10000;
    return `calc(${base} * ${factor})`;
  });

  // timing(duration, easing, options?)
  renderer.registerFunctionRenderer('timing', (args, options) => {
    const duration = argToCssValue(args[0]);
    const easing = typeof args[1] === 'string' ? args[1] : String(args[1]);
    const delay = options?.delay;
    if (delay) return `${duration} ${easing} ${delay}ms`;
    return `${duration} ${easing}`;
  });

  // --- Functions WITH scope (resolve to computed value in CSS since
  //     there's no CSS equivalent for "pick best contrast from a set") ---
  //     These fall through to the default resolved-value behavior in the renderer.
  //     No need to register them — the renderer already resolves the value.
}
