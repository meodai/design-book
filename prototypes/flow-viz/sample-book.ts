import { writeFileSync } from 'node:fs';
import {
  DesignBook, color, ref, px, rem, ms, ramp, relativeTo, bestContrastWith, minContrastWith,
  nextLarger, nextSmaller, darken, lighten, colorMix, mostVivid, shade, typography, variant, sibling,
} from '../../src/index';
import { parse, formatHex } from 'culori';

const hexOf = (v: string) => { try { const p = parse(v); return p ? formatHex(p) : null; } catch { return null; } };
const book = new DesignBook('demo');
const brand = book.addScope('brand');
brand.set('primary', color('#de5331'));
brand.set('secondary', color('#2f6fd6'));
brand.set('ink', color('#1b1d24'));

const palette = book.addScope('palette');
for (const s of ['50','100','200','400','600','800','900']) palette.set(`red-${s}`, ramp(ref('brand.primary'), { shade: s }));
for (const s of ['50','200','400','600','900']) palette.set(`blue-${s}`, ramp(ref('brand.secondary'), { shade: s }));
palette.set('complement', relativeTo(ref('palette.red-400'), 'oklch', [null, null, '+180']));

const neutral = book.addScope('neutral');
neutral.set('white', color('#ffffff'));
for (const [k, a] of [['100',0.94],['300',0.7],['500',0.45],['700',0.2]] as const) neutral.set(k, colorMix(ref('brand.ink'), ref('neutral.white'), a));
neutral.set('black', ref('brand.ink'));

const space = book.addScope('space');
[['xs',4],['s',8],['m',12],['l',16],['xl',24],['2xl',40]].forEach(([k,v]) => space.set(k as string, px(v as number)));
const size = book.addScope('size');
[['sm',0.875],['base',1],['lg',1.25],['xl',1.6],['2xl',2.2]].forEach(([k,v]) => size.set(k as string, rem(v as number)));
const motion = book.addScope('motion');
motion.set('fast', ms(120)); motion.set('slow', ms(320));

const ui = book.addScope('ui');
ui.set('surface', ref('neutral.white'));
ui.set('surface-raised', ref('neutral.100'));
ui.set('text', bestContrastWith(ref('ui.surface'), book.getScope('neutral')!));
ui.set('muted', minContrastWith(ref('ui.surface'), book.getScope('neutral')!, { minContrast: 3 }));
ui.set('border', ref('neutral.300'));
ui.set('accent', ref('palette.red-600'));
ui.set('on-accent', bestContrastWith(ref('ui.accent'), book.getScope('palette')!));
ui.set('accent-hover', darken(ref('ui.accent'), { amount: 0.12 }));
ui.set('link', mostVivid(book.getScope('palette')!));
ui.set('danger', ref('palette.red-800'));
ui.set('info', ref('palette.blue-600'));
ui.set('gap', nextLarger(ref('space.m'), book.getScope('space')!));
ui.set('gap-tight', nextSmaller(ref('space.m'), book.getScope('space')!));

const text = book.addScope('text');
text.set('body', typography({ fontSize: ref('size.base'), lineHeight: '1.5' }));
text.set('lead', variant(ref('text.body'), { fontSize: ref('size.lg') }));
text.set('heading', typography({ fontSize: ref('size.2xl'), lineHeight: '1.1', fontWeight: '700' }));
text.set('caption', variant(ref('text.body'), { fontSize: ref('size.sm') }));

const button = book.addScope('button');
button.set('bg', ref('ui.accent'));
button.set('fg', ref('ui.on-accent'));
button.set('bg-hover', ref('ui.accent-hover'));
button.set('pad', ref('space.m'));           // jump past ui
button.set('font', ref('text.body'));
button.set('transition', ref('motion.fast')); // jump
const danger = book.addScope('button-danger', { extends: 'button' } as any);
danger.set('bg', ref('ui.danger'));
danger.set('bg-hover', darken(ref('palette.red-800'), { amount: 0.1 })); // jump to palette

const card = book.addScope('card');
card.set('bg', ref('ui.surface-raised'));
card.set('border', ref('ui.border'));
card.set('pad', ref('ui.gap'));
card.set('title', ref('text.heading'));
card.set('shadow', colorMix(ref('brand.ink'), ref('neutral.white'), 0.85)); // jump to brand

const input = book.addScope('input');
input.set('bg', ref('ui.surface'));
input.set('border', ref('ui.border'));
input.set('focus', ref('ui.info'));
input.set('placeholder', ref('ui.muted'));
input.set('pad', ref('space.s'));
input.set('font', ref('text.body'));

const toast = book.addScope('toast');
toast.set('bg', ref('neutral.700'));
toast.set('fg', ref('neutral.white'));
toast.set('action', ref('button.bg'));  // component reading component
toast.set('pad', ref('card.pad'));

// @ts-ignore
const { collect } = await import('./collect.mjs');
const { scopes, tokens, edges } = collect(book, hexOf);
writeFileSync(process.argv[2] ?? new URL('./data/sample.json', import.meta.url), JSON.stringify({ scopes, tokens, edges }));
console.log(scopes.length, 'scopes', tokens.length, 'tokens', edges.length, 'edges');
console.log(scopes);
