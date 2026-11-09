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
 * Nothing is stored on tokens. The book's resolve cache keeps the pick a
 * computation reported next to its value and reports it again on a hit
 * (`beginCapture` / `endCapture` / `replay`), so a cached resolve answers
 * `capturePick` the same way a fresh one does.
 */

interface Frame {
  key?: string;
}

/** Listens for the function call that closes at `depth`: `key` is what it
 *  reported, `closed` whether one closed there at all. */
export interface Capture {
  depth: number;
  key?: string;
  closed: boolean;
}

const frames: Frame[] = [];
const captures: Capture[] = [];

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
    if (capture && frames.length === capture.depth) {
      capture.key = frame.key;
      capture.closed = true;
    }
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
  const capture = beginCapture();
  try {
    resolve();
  } finally {
    endCapture();
  }
  return capture.key;
}

/** Starts listening at the current depth (see `Capture`). */
export function beginCapture(): Capture {
  const capture: Capture = { depth: frames.length, closed: false };
  captures.push(capture);
  return capture;
}

/** Stops the innermost capture. */
export function endCapture(): void {
  captures.pop();
}

/** Reports again what a capture heard, as if its call had closed now: a
 *  cached result answers the capture listening outside it. */
export function replay(heard: { key?: string; closed: boolean }): void {
  if (!heard.closed) return;
  const capture = captures[captures.length - 1];
  if (capture && frames.length === capture.depth) {
    capture.key = heard.key;
    capture.closed = true;
  }
}
