import type { ComparableEntry, TokenOrderer } from './index';

export const stringOrderer: TokenOrderer = (entries: ComparableEntry[]) =>
  [...entries].sort((a, b) => a.resolved.localeCompare(b.resolved));
