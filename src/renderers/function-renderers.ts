import type { Renderer } from './renderer';
import type { ReferenceValue, TokenValue } from '../tokens';

function resolveArgToString(arg: any): string {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number') return String(arg);
  if (typeof arg === 'object' && arg !== null) {
    // ReferenceValue: type === 'reference'
    if (arg.type === 'reference') {
      const ref = arg as ReferenceValue;
      return `var(--${ref.key.replace(/[._]/g, '-')})`;
    }
    // TokenValue with rawValue
    if ('rawValue' in arg) {
      const tv = arg as TokenValue;
      if (tv.metadata?.unit) return `${tv.rawValue}${tv.metadata.unit}`;
      return String(tv.rawValue);
    }
  }
  return String(arg);
}

export function registerBuiltinFunctionRenderers(renderer: Renderer): void {
  // colorMix: color-mix(in ${space}, ${c1} ${pct}%, ${c2})
  renderer.registerFunctionRenderer('colorMix', (args, options) => {
    const color1 = resolveArgToString(args[0]);
    const color2 = resolveArgToString(args[1]);
    const ratio = options?.ratio ?? 0.5;
    const colorSpace = options?.colorSpace ?? 'lab';
    const pct = Math.round(ratio * 100);
    return `color-mix(in ${colorSpace}, ${color1} ${pct}%, ${color2})`;
  });

  // lighten: color-mix(in oklch, ${color} ${100-pct}%, white)
  renderer.registerFunctionRenderer('lighten', (args, options) => {
    const color = resolveArgToString(args[0]);
    const amount = options?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, white)`;
  });

  // darken: color-mix(in oklch, ${color} ${100-pct}%, black)
  renderer.registerFunctionRenderer('darken', (args, options) => {
    const color = resolveArgToString(args[0]);
    const amount = options?.amount ?? 0.1;
    const pct = Math.round((1 - amount) * 100);
    return `color-mix(in oklch, ${color} ${pct}%, black)`;
  });

  // relativeTo: use CSS relative color syntax
  renderer.registerFunctionRenderer('relativeTo', (args, options) => {
    const color = resolveArgToString(args[0]);
    return color; // Fallback — relativeTo has complex CSS syntax; return resolved value
  });
}
