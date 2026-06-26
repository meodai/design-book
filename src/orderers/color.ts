import { auto, normalizeUp } from 'colorsort-js';
import DATA from 'colorsort-js/trained.json';
import { formatHex, parse } from 'culori';
import type { ComparableEntry, TokenOrderer } from './index';

const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/** Coerce a resolved color string to #rrggbb, or null if unparseable. */
function toHex(resolved: string): string | null {
  if (HEX.test(resolved)) return resolved.length === 4
    ? formatHex(resolved) ?? null   // expand #abc -> #aabbcc
    : resolved.toLowerCase();
  const parsed = parse(resolved);
  return parsed ? formatHex(parsed) ?? null : null;
}

/** Smoothest ordering of a color set, oriented dark -> light (ascending).
 *  Holistic: colorsort-js auto() consumes the whole array at once. Static
 *  import, lazy execution — auto() runs only when this orderer is called. */
export const colorOrderer: TokenOrderer = (entries: ComparableEntry[]) => {
  if (entries.length <= 1) return entries;

  // Build parallel arrays; drop unparseable entries to the end in input order.
  const hexable: { entry: ComparableEntry; hex: string }[] = [];
  const dropped: ComparableEntry[] = [];
  for (const entry of entries) {
    const hex = toHex(entry.resolved);
    if (hex) hexable.push({ entry, hex });
    else dropped.push(entry);
  }
  if (hexable.length <= 1) return [...hexable.map(h => h.entry), ...dropped];

  try {
    const sortedHexes: string[] = normalizeUp(auto(hexable.map(h => h.hex), DATA));
    // Map each sorted hex back to its entry (first unused match wins on dupes).
    const pool = [...hexable];
    const ordered: ComparableEntry[] = [];
    for (const hex of sortedHexes) {
      const i = pool.findIndex(h => h.hex === hex);
      if (i >= 0) ordered.push(pool.splice(i, 1)[0].entry);
    }
    ordered.push(...pool.map(h => h.entry)); // any leftovers
    return [...ordered, ...dropped];
  } catch {
    return entries; // never throw out of an orderer
  }
};
