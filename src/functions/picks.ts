import type { Scope } from '../scope';

/**
 * Which member a selector picked, as the selector itself reports it.
 *
 * A selector returns a value, and two members can share one, so "the member
 * with that value" is ambiguous. Instead every built-in selector reports the
 * key it chose (`picked`) while it runs. `Scope.resolveFunctionToken` runs
 * each function call in its own frame (`inFrame`), so a selector's report
 * lands in its own frame — not in the frame of a pool member it resolved on
 * the way, which may be a selector too. `capturePick` resolves a token and
 * returns what its call reported; the SVG renderer uses it to draw a
 * selector's edge from the member it picked.
 *
 * Nothing is stored on tokens or in the book: a pick is read by resolving
 * again, the same way the value is.
 */

interface Frame {
  key?: string;
}

const frames: Frame[] = [];
const captures: Array<{ depth: number; key?: string }> = [];

/** Runs one function call — its arguments and its implementation — in its
 *  own frame. */
export function inFrame<T>(run: () => T): T {
  frames.push({});
  try {
    return run();
  } finally {
    const frame = frames.pop()!;
    const capture = captures[captures.length - 1];
    // The frame that closes back at the capture's depth is the call it asked for.
    if (capture && frames.length === capture.depth) capture.key = frame.key;
  }
}

/** Reports the member a selector chose, and passes its value through:
 *  `return picked(scope, best.key, best.hex)`. */
export function picked(scope: Scope, key: string, value: string): string {
  const frame = frames[frames.length - 1];
  if (frame) frame.key = `${scope.name}.${key}`;
  return value;
}

/** Resolves through `resolve` and returns the member the outermost function
 *  call reported — `undefined` when it reported none (a value transform, or
 *  a custom function that does not call `picked`). */
export function capturePick(resolve: () => unknown): string | undefined {
  const capture: { depth: number; key?: string } = { depth: frames.length };
  captures.push(capture);
  try {
    resolve();
  } finally {
    captures.pop();
  }
  return capture.key;
}
