// A curated DesignBook used across the marketing page.
// One book powers: the dependency graph, the renderer comparison, and
// some of the smaller demos. Touching the brand input updates every
// dependent visible on the page.

import {
  DesignBook,
  color, ref, px,
  bestContrastWith,
  minContrastWith,
  mostVivid,
  nextLarger,
  nextSmaller,
  darken,
  shade,
} from '../src/index';

export function buildBook () {
  const book = new DesignBook('marketing-demo');

  // — A small set of curated values. The "raw palette" of the system. —
  const values = book.addScope('values');
  values.set('ink',       color('#14110d'));
  values.set('paper',     color('#f5efe2'));
  values.set('vermilion', color('#c8391a'));
  values.set('lapis',     color('#1c3a9a'));
  values.set('saffron',   color('#d49623'));
  values.set('moss',      color('#4f6033'));
  values.set('plum',      color('#7a3c8e'));
  values.set('teal',      color('#1d6b6a'));

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
  ui.set('surface', ref('values.paper'));
  ui.set('text',    bestContrastWith(ref('ui.surface'), values));
  ui.set('accent',  mostVivid(values, {
    against:     ref('ui.surface'),
    minContrast: 4.5,
  }));
  ui.set('subtle',  minContrastWith(ref('ui.surface'), values, { ratio: 3 }));
  ui.set('hover',   darken(ref('ui.accent'), { amount: 0.12 }));
  ui.set('gap',     nextLarger(ref('space.m'), space));
  ui.set('breath',  nextSmaller(ref('space.m'), space));

  return book;
}
