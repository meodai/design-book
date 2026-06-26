import type { AnyTokenValue } from '../tokens';
import type { DesignBook } from '../design-book';

/** A token reduced to what an orderer needs: its key, effective type, and
 *  resolved value string. Orderers sort a homogeneous (same-type) list. */
export interface ComparableEntry {
  key: string;
  type: string;
  resolved: string;
  token: AnyTokenValue;
}

/** Sort a homogeneous list of same-type entries into ascending order.
 *  Holistic (whole list at once) so set-based sorts like colorsort-js fit. */
export type TokenOrderer = (entries: ComparableEntry[]) => ComparableEntry[];

/** Auto-register built-in orderers on a DesignBook. Filled in by later
 *  tasks (dimension, string, color). */
export function registerBuiltinOrderers(book: DesignBook): void {
  // dimension/string/color orderers registered in Tasks 2 & 3.
}
