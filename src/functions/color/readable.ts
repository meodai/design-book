import { FunctionError } from '../../errors';
import type { FunctionTokenValue, ReferenceValue, TokenValue } from '../../tokens';
import { DEFAULT_READABLE_CONTRAST } from '../pool';

/**
 * Readability filter shared by the color selectors. Like `not`, it narrows
 * the candidate pool before the selector ranks anything: every candidate
 * that does not reach `readableContrast` against `readableOn` is dropped
 * (`colorPool` in `../pool` applies it). The selector's own rule (chroma,
 * lightness, distance, …) then picks from what is left.
 *
 * `readableOn` is an input option: it resolves like an argument and is a
 * value dependency, so the pick follows the backdrop when it changes.
 */
export interface ReadableOnOptions {
  /** Backdrop every candidate must stay readable on. */
  readableOn?: TokenValue | ReferenceValue | FunctionTokenValue;
  /** WCAG ratio a candidate must reach against `readableOn`. Defaults to 4.5. */
  readableContrast?: number;
}

/** What the implementation receives once the inputs are resolved. */
export interface ReadableOn {
  readableOn?: string;
  readableContrast?: number;
}

/** Constructor side: checks the options and returns the ones to store. */
export function readableOnOptions(name: string, options?: ReadableOnOptions): ReadableOnOptions {
  const on = options?.readableOn;
  const min = options?.readableContrast;
  if (!on) {
    if (min !== undefined) {
      throw new FunctionError(`${name}: \`readableContrast\` needs \`readableOn\` to measure against`, name);
    }
    return {};
  }
  const ratio = min ?? DEFAULT_READABLE_CONTRAST;
  if (typeof ratio !== 'number' || !(ratio > 0)) {
    throw new FunctionError(`${name}: \`readableContrast\` must be a positive number, got ${String(min)}`, name);
  }
  return { readableOn: on, readableContrast: ratio };
}
