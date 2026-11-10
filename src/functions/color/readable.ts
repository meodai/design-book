import { FunctionError } from '../../errors';
import type { FunctionTokenValue, ReferenceValue, TokenValue } from '../../tokens';
import { contrastOption } from './contrast';
import type { ContrastMethod, ContrastThreshold } from './contrast';

/**
 * Readability filter shared by the color selectors. Like `not`, it narrows
 * the candidate pool before the selector ranks anything: every candidate
 * that does not reach `readableContrast` against `readableOn` (in the book's
 * contrast method, WCAG or APCA, with the candidate as the text) is dropped
 * (`colorPool` in `../pool` applies it). The selector's own rule (chroma,
 * lightness, distance, …) then picks from what is left.
 *
 * `readableOn` is an input option: it resolves like an argument and is a
 * value dependency, so the pick follows the backdrop when it changes.
 */
export interface ReadableOnOptions {
  /** Backdrop every candidate must stay readable on. */
  readableOn?: TokenValue | ReferenceValue | FunctionTokenValue;
  /** The contrast a candidate must reach against \`readableOn\`, in the
   *  book's method: a WCAG ratio (default 4.5) or an APCA Lc (default 60) —
   *  or a text style (\`ref('type.body')\`, \`{ fontSize, fontWeight }\`)
   *  that the method turns into its minimum for that size and weight. */
  readableContrast?: ContrastThreshold;
}

/** What the implementation receives once the inputs are resolved. */
export interface ReadableOn {
  readableOn?: string;
  /** A number, a numeric string or a text style (a group, or its spec). */
  readableContrast?: unknown;
  /** The book's contrast method (the registry adds it). */
  contrast?: ContrastMethod;
}

/** Constructor side: checks the options and returns the ones to store. The
 *  threshold is kept as written; its default depends on the book. */
export function readableOnOptions(name: string, options?: ReadableOnOptions): ReadableOnOptions {
  const on = options?.readableOn;
  const min = options?.readableContrast;
  if (!on) {
    if (min !== undefined) {
      throw new FunctionError(`${name}: \`readableContrast\` needs \`readableOn\` to measure against`, name);
    }
    return {};
  }
  const threshold = contrastOption(name, 'readableContrast', min);
  return { readableOn: on, ...(threshold !== undefined ? { readableContrast: threshold } : {}) };
}
