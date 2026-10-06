import type { DesignBook } from './design-book';

export interface BookDiff {
  /** Keys in both books whose resolved value differs, in `a`'s order. */
  changed: { key: string; from: string; to: string }[];
  /** Keys only `b` has, in `b`'s order. */
  added: { key: string; value: string }[];
  /** Keys only `a` has, in `a`'s order. */
  removed: { key: string; value: string }[];
}

/** Every `scope.key` of a book with its resolved value. A token that fails
 *  to resolve is compared by its error message. */
function resolvedValues(book: DesignBook): Map<string, string> {
  const out = new Map<string, string>();
  for (const scope of book.getAllScopes()) {
    for (const key of scope.getAllKeys()) {
      const qualified = `${scope.name}.${key}`;
      try {
        out.set(qualified, book.resolve(qualified));
      } catch (e) {
        out.set(qualified, `Error: ${(e as Error).message}`);
      }
    }
  }
  return out;
}

/**
 * What differs between two books, by resolved value — a brand against its
 * base, an inverted context against the default. Variations are usually built
 * by running the same setup twice and overriding a few tokens; this reports
 * the overrides and everything they changed downstream.
 */
export function diffBooks(a: DesignBook, b: DesignBook): BookDiff {
  const before = resolvedValues(a);
  const after = resolvedValues(b);
  const diff: BookDiff = { changed: [], added: [], removed: [] };
  for (const [key, from] of before) {
    if (!after.has(key)) diff.removed.push({ key, value: from });
    else if (after.get(key) !== from) diff.changed.push({ key, from, to: after.get(key)! });
  }
  for (const [key, value] of after) {
    if (!before.has(key)) diff.added.push({ key, value });
  }
  return diff;
}
