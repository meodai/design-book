// A curated DesignBook used across the marketing page.
// One book powers: the dependency graph, the renderer comparison, and
// some of the smaller demos. Touching the brand input updates every
// dependent visible on the page.

import {
  DesignBook,
  color, ref, px,
  ramp,
  relativeTo,
  bestContrastWith,
  minContrastWith,
  nextLarger,
  nextSmaller,
  darken,
} from '../src/index';

/** Ordered top-to-bottom in the values table — flipping reverses this list. */
export const RAMP_SHADES = ['50', '200', '400', '600', '800', '900'];

/** Build the values scope as a ramp derived from `brand.primary`, with a
 *  complementary token off the 400 stop. `flipped=true` reverses the
 *  shade-to-token mapping so dark and light ends swap. */
export function applyRampToValues (book, { flipped = false } = {}) {
  const values = book.getScope('values');
  const order = flipped ? [...RAMP_SHADES].reverse() : RAMP_SHADES;
  for (let i = 0; i < RAMP_SHADES.length; i++) {
    values.set(`shade-${RAMP_SHADES[i]}`, ramp(ref('brand.primary'), { shade: order[i] }));
  }
  // Complement: rotate hue 180° in OKLCH off the (current) 400 stop.
  values.set('complement', relativeTo(ref('values.shade-400'), 'oklch', [null, null, '+180']));
}

export function buildBook () {
  const book = new DesignBook('marketing-demo');

  // — Seed: a single brand color that the whole palette is derived from. —
  const brand = book.addScope('brand');
  brand.set('primary', color('#c8391a'));

  // — Derived palette: a ramp + its complement. —
  book.addScope('values');
  applyRampToValues(book);

  // — A dimensional scale. Used by nextLarger / nextSmaller. —
  const space = book.addScope('space');
  space.set('xs', px(4));
  space.set('s',  px(8));
  space.set('m',  px(12));
  space.set('l',  px(16));
  space.set('xl', px(24));
  space.set('2xl', px(40));

  // — Decisions on top of values. The interesting layer. —
  const ui = book.addScope('ui');
  const values = book.getScope('values');
  ui.set('surface', ref('values.shade-50'));
  ui.set('text',    bestContrastWith(ref('ui.surface'), values));
  ui.set('accent',   ref('values.complement'));
  ui.set('onAccent', bestContrastWith(ref('ui.accent'), values));
  ui.set('subtle',  minContrastWith(ref('ui.surface'), values, {
    ratio: 3,
    not:   [ref('ui.accent')],
  }));
  ui.set('hover',   darken(ref('ui.accent'), { amount: 0.12 }));
  ui.set('gap',     nextLarger(ref('space.m'), space));
  ui.set('breath',  nextSmaller(ref('space.m'), space));

  return book;
}
