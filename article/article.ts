import {
  DesignBook,
  SVGRenderer,
  color,
  ref,
  px,
  darken,
  shade,
  spacingScale,
  typographyScale,
  bestContrastWith,
  minContrastWith,
  mostVivid,
  colorMix,
  nextLarger,
  nextSmaller,
} from '../src';
import type {
  FunctionTokenValue,
  ReferenceValue,
  TokenValue,
} from '../src';
import { parse, wcagContrast } from 'culori';
import { Poline, positionFunctions } from 'poline';
import 'poline/picker';
import 'hdr-color-input';
import './style.css';

// ---------------------------------------------------------------------------
// 1. Token setup
// ---------------------------------------------------------------------------

const book = new DesignBook('article');

// The values layer is the atom layer: every token here is named after WHAT
// it is (a colour, a length), not what it MEANS. No semantics, no roles —
// just raw material the rest of the system can reference.
const values = book.addScope('values');
values.set('gray50',   color('#fafafa'));
values.set('gray500',  color('#717c8f'));
values.set('gray800',  color('#202126'));
values.set('gray900',  color('#1a1a1a'));
values.set('blue500',  color('#1d4eb8'));
values.set('red500',   color('#dc2626'));
values.set('white',    color('#ffffff'));

// ---------------------------------------------------------------------------
// Poline (§5) — a procedural palette that takes over the values pool on scroll
// ---------------------------------------------------------------------------
//
// At boot the values scope still holds the hard-coded hex tokens (gray50,
// gray800, blue500, …). When the reader scrolls into the §5 palette picker,
// activateProceduralPalette() runs once: the descriptive tokens are deleted,
// nine new `values.poline100`…`values.poline900` tokens are sampled along
// the Poline line, and the semantic refs (color.surface / color.brand /
// color.interaction) are re-pointed at the new palette. From that moment on
// any drag in the picker re-runs syncPolineValues, and the entire system —
// chart bars, button label, body text, ramp anchors — moves together.
const polineState = new Poline({
  anchorColors: [
    [246, 0.76, 1.00],
    [91,  0.31, 0.42],
  ],
  numPoints: 6,
  positionFunctionX: positionFunctions.sinusoidalPosition,
  positionFunctionY: positionFunctions.quadraticPosition,
  positionFunctionZ: positionFunctions.linearPosition,
});

const POLINE_TOKEN_COUNT = 9;
const polineTokenNames = Array.from(
  { length: POLINE_TOKEN_COUNT },
  (_, i) => `poline${(i + 1) * 100}`,
);

let proceduralActivated = false;

function syncPolineValues() {
  if (!proceduralActivated) return;
  const steps = POLINE_TOKEN_COUNT - 1;
  for (let i = 0; i < POLINE_TOKEN_COUNT; i++) {
    const t = i / steps;
    try {
      const point = polineState.getColorAt(t);
      values.set(polineTokenNames[i], color(point.hslCSS));
    } catch (err) {
      console.warn(`[poline] sync failed for ${polineTokenNames[i]}:`, err);
    }
  }
}

function activateProceduralPalette() {
  if (proceduralActivated) return;
  proceduralActivated = true;

  // §3's onSurface rewire must have fired before we touch the values pool.
  // If the reader landed on §5 without scrolling past §3 (deep link, fast
  // scroll, page reloaded near the bottom), color.onSurface would still be
  // `ref('values.gray900')` — and would dangle the moment we delete the
  // descriptive value tokens below. rewireOnSurface() is idempotent.
  rewireOnSurface();
  document.querySelectorAll('[data-rewire="onSurface"]').forEach((m) => {
    (m as HTMLElement).classList.add('rewire-fired');
  });

  // Build the new palette first so refs always point at something valid
  // during the transition.
  syncPolineValues();

  // Re-point semantic refs to the new palette. surface lands at the
  // lightest step. brand and interaction both stop being fixed slots and
  // become procedural: mostVivid scans the palette and picks the
  // highest-chroma candidate that still clears a 4.5 WCAG contrast against
  // the surface. The two will usually coincide — a single readable accent
  // colour driving both the button background and the links — which is the
  // usual real-world pattern.
  colorScope.set('surface', ref('values.poline100'));
  // `not` keeps the procedural accent from landing on role-loaded values
  // like values.red500 — those have their own semantic meaning (error /
  // alert) and shouldn't be reused as the brand / link colour.
  colorScope.set('brand', mostVivid(values, {
    against: ref('color.surface'),
    minContrast: 4.5,
    not: [ref('values.red500')],
  }));
  colorScope.set('interaction', mostVivid(values, {
    against: ref('color.surface'),
    minContrast: 4.5,
    not: [ref('values.red500')],
  }));

  // Drop the descriptive value tokens — the palette is now Poline-driven.
  for (const name of ['gray50', 'gray500', 'gray800', 'gray900', 'blue500', 'red500', 'white']) {
    values.delete(name);
  }
}

function deactivateProceduralPalette() {
  if (!proceduralActivated) return;
  proceduralActivated = false;

  // Restore original descriptive tokens before pulling poline tokens out,
  // so semantic refs always point at something valid in between.
  values.set('gray50',   color('#fafafa'));
  values.set('gray500',  color('#717c8f'));
  values.set('gray800',  color('#202126'));
  values.set('gray900',  color('#1a1a1a'));
  values.set('blue500',  color('#1d4eb8'));
  values.set('red500',   color('#dc2626'));
  values.set('white',    color('#ffffff'));

  // Re-point semantic refs back to the originals.
  colorScope.set('surface',     ref('values.gray50'));
  colorScope.set('brand',       ref('values.gray800'));
  colorScope.set('interaction', ref('values.blue500'));

  for (const name of polineTokenNames) {
    values.delete(name);
  }
}

// The color layer is the semantic layer: refs that give the raw values a
// role in the system. "surface" / "onSurface" name a paired purpose;
// "brand" and "interaction" name intents. Same hex behind the scenes — but
// here the names mean something to the design system.
const colorScope = book.addScope('color');
colorScope.set('surface',     ref('values.gray50'));
colorScope.set('onSurface',   ref('values.gray900'));
colorScope.set('brand',       ref('values.gray800'));
colorScope.set('interaction', ref('values.blue500'));
colorScope.set('text',        ref('color.onSurface'));
colorScope.set('linkHover',   darken(ref('color.interaction'), { amount: 0.15 }));

// A procedural ramp: 7 steps interpolated between a slightly-shifted
// surface and color.interaction in oklch. The shift uses `shade` inline
// (function tokens nest), so the demo holds up no matter where the surface
// lands — `shade` darkens light surfaces, lightens dark ones.
const ramp = book.addScope('ramp');
ramp.set('s100', colorMix(shade(ref('color.surface'), { amount: 0.10 }), ref('color.interaction'), { ratio: 0.05, colorSpace: 'oklch' }));
ramp.set('s200', colorMix(shade(ref('color.surface'), { amount: 0.10 }), ref('color.interaction'), { ratio: 0.15, colorSpace: 'oklch' }));
ramp.set('s300', colorMix(shade(ref('color.surface'), { amount: 0.10 }), ref('color.interaction'), { ratio: 0.30, colorSpace: 'oklch' }));
ramp.set('s400', colorMix(shade(ref('color.surface'), { amount: 0.10 }), ref('color.interaction'), { ratio: 0.50, colorSpace: 'oklch' }));
ramp.set('s500', colorMix(shade(ref('color.surface'), { amount: 0.10 }), ref('color.interaction'), { ratio: 0.70, colorSpace: 'oklch' }));
ramp.set('s700', colorMix(shade(ref('color.surface'), { amount: 0.10 }), ref('color.interaction'), { ratio: 0.90, colorSpace: 'oklch' }));
ramp.set('s900', ref('color.interaction'));
// Button label: highest-contrast ramp step against color.brand (the button
// background). The decision ("readable label on whatever the button is")
// lives in the token instead of in a comment.
colorScope.set('buttonText', bestContrastWith(ref('color.brand'), ramp));
// Hairline / outline: the ramp step that *just barely* contrasts with the
// surface — visible but not loud. minContrastWith picks the lowest candidate
// above the threshold, so this gives a soft border that auto-flips when the
// surface goes dark.
colorScope.set('line',       minContrastWith(ref('color.surface'), ramp, { ratio: 1.5 }));

const space = book.addScope('space');
space.set('base', px(16));
space.set('xs', spacingScale(ref('space.base'), { multiplier: 0.25 }));
space.set('s',  spacingScale(ref('space.base'), { multiplier: 0.5 }));
space.set('m',  spacingScale(ref('space.base'), { multiplier: 1 }));
space.set('l',  spacingScale(ref('space.base'), { multiplier: 1.75 }));
space.set('xl', spacingScale(ref('space.base'), { multiplier: 3 }));

// Step UP from m — the next bigger member of the scale, whatever it is.
// Add a new step later and emphasis follows automatically.
space.set('emphasis', nextLarger(ref('space.m'), space));
// Step DOWN from m — the tighter sibling.
space.set('tight',    nextSmaller(ref('space.m'), space));

const type = book.addScope('type');
type.set('base', px(18));
type.set('body', ref('type.base'));
type.set('h3',   typographyScale(ref('type.base'), { ratio: 1.2, step: 1 }));
type.set('h2',   typographyScale(ref('type.base'), { ratio: 1.2, step: 2 }));
type.set('h1',   typographyScale(ref('type.base'), { ratio: 1.2, step: 3 }));

const radius = book.addScope('radius');
radius.set('base', px(6));
radius.set('lg',   px(10));

// All scopes we manage, in display order. Used for the defaults snapshot
// and the reference-token candidate picker.
const trackedScopes = [
  ['values', values],
  ['ramp',   ramp],
  ['color',  colorScope],
  ['space',  space],
  ['type',   type],
  ['radius', radius],
] as const;

// Snapshot defaults (raw values only) for the reset button.
type Snapshot = Array<{ scope: string; name: string; value: number | string }>;
const defaults: Snapshot = [];
for (const [scopeName, scope] of trackedScopes) {
  for (const [name, tok] of Object.entries(scope.allTokens())) {
    if (tok.type === 'color' || tok.type === 'dimension') {
      defaults.push({ scope: scopeName, name, value: (tok as TokenValue).rawValue as number | string });
    } else if (tok.type === 'function') {
      const fn = tok as FunctionTokenValue;
      if (fn.name === 'darken' && fn.options?.amount !== undefined) {
        defaults.push({ scope: scopeName, name: `${name}.amount`, value: fn.options.amount as number });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. CSS custom-prop binding
// ---------------------------------------------------------------------------

const cssBindings: Record<string, string> = {
  '--color-surface':    'color.surface',
  '--color-text':       'color.text',
  '--color-brand':       'color.brand',
  '--color-interaction': 'color.interaction',
  '--color-link-hover':  'color.linkHover',
  '--color-button-text': 'color.buttonText',
  '--color-line':        'color.line',
  '--ramp-100':         'ramp.s100',
  '--ramp-200':         'ramp.s200',
  '--ramp-300':         'ramp.s300',
  '--ramp-400':         'ramp.s400',
  '--ramp-500':         'ramp.s500',
  '--ramp-700':         'ramp.s700',
  '--ramp-900':         'ramp.s900',
  '--space-xs':         'space.xs',
  '--space-s':          'space.s',
  '--space-m':          'space.m',
  '--space-l':          'space.l',
  '--space-xl':         'space.xl',
  '--type-body':        'type.body',
  '--type-h1':          'type.h1',
  '--type-h2':          'type.h2',
  '--type-h3':          'type.h3',
  '--radius-base':      'radius.base',
  '--radius-lg':        'radius.lg',
};

function syncCss() {
  const root = document.documentElement;
  for (const [prop, key] of Object.entries(cssBindings)) {
    try {
      root.style.setProperty(prop, book.resolve(key));
    } catch (err) {
      console.warn(`[article] could not resolve ${key}:`, err);
    }
  }
  updateChips();
}

book.on('change', syncCss);

// ---------------------------------------------------------------------------
// 3. Chip rendering
// ---------------------------------------------------------------------------

type ChipInfo =
  | { kind: 'token'; scopeName: string; name: string }
  | { kind: 'fn-option'; scopeName: string; name: string; optionName: string };

function getChipInfo(chip: HTMLElement): ChipInfo | null {
  const tokenAttr = chip.dataset.token;
  if (tokenAttr) {
    const dot = tokenAttr.indexOf('.');
    if (dot < 0) return null;
    return { kind: 'token', scopeName: tokenAttr.slice(0, dot), name: tokenAttr.slice(dot + 1) };
  }
  const fnAttr = chip.dataset.fnOption;
  if (fnAttr) {
    const parts = fnAttr.split('.');
    if (parts.length < 3) return null;
    const optionName = parts.pop()!;
    const scopeName = parts.shift()!;
    return { kind: 'fn-option', scopeName, name: parts.join('.'), optionName };
  }
  return null;
}

/** Walk through reference tokens until we reach a non-reference. */
function resolveToPrimitive(scopeName: string, name: string): { scopeName: string; name: string } | null {
  let s = scopeName;
  let n = name;
  for (let i = 0; i < 10; i++) {
    const scope = book.getScope(s);
    if (!scope) return null;
    const tok = scope.get(n);
    if (!tok) return null;
    if (tok.type !== 'reference') return { scopeName: s, name: n };
    const key = (tok as ReferenceValue).key;
    const dot = key.indexOf('.');
    if (dot < 0) return null;
    s = key.slice(0, dot);
    n = key.slice(dot + 1);
  }
  return null;
}

function getPrimitiveType(scopeName: string, name: string): string | null {
  const prim = resolveToPrimitive(scopeName, name);
  if (!prim) return null;
  const tok = book.getScope(prim.scopeName)?.get(prim.name);
  return tok?.type ?? null;
}

function renderChip(chip: HTMLElement) {
  const info = getChipInfo(chip);
  if (!info) return;
  const scope = book.getScope(info.scopeName);
  if (!scope) return;
  const displayDecimals = getDisplayDecimals(chip);

  chip.innerHTML = '';
  chip.classList.remove('token-chip--color', 'token-chip--num', 'token-chip--ref');

  if (info.kind === 'fn-option') {
    const tok = scope.get(info.name) as FunctionTokenValue | undefined;
    if (!tok || tok.type !== 'function') return;
    const value = (tok.options as Record<string, unknown> | undefined)?.[info.optionName];
    chip.classList.add('token-chip--num');
    const span = document.createElement('span');
    span.className = 'chip-value';
    span.textContent = typeof value === 'number'
      ? formatNumber(value, displayDecimals)
      : String(value ?? '');
    chip.append(span);
    chip.title = `${info.scopeName}.${info.name} option “${info.optionName}” = ${value}`;
    return;
  }

  const tok = scope.get(info.name);
  const primType = getPrimitiveType(info.scopeName, info.name);
  let resolved = '';
  try {
    resolved = book.resolve(`${info.scopeName}.${info.name}`);
  } catch {
    // leave resolved empty
  }

  // Reference tokens render as `[swatch] → target.key` so the indirection is
  // visible. The swatch shows the resolved color for context; the arrow + key
  // make it unmistakable that this token points elsewhere rather than holding
  // a value.
  if (tok && tok.type === 'reference') {
    const refKey = (tok as ReferenceValue).key;
    chip.classList.add('token-chip--ref');
    if (primType === 'color') {
      const swatch = document.createElement('span');
      swatch.className = 'chip-swatch';
      swatch.style.background = resolved || 'transparent';
      chip.append(swatch);
    }
    const arrow = document.createElement('span');
    arrow.className = 'chip-arrow';
    arrow.textContent = '→';
    chip.append(arrow);
    const target = document.createElement('span');
    target.className = 'chip-value';
    target.textContent = refKey;
    chip.append(target);
    chip.title = `${info.scopeName}.${info.name} = ref('${refKey}')`;
    return;
  }

  if (primType === 'color') {
    chip.classList.add('token-chip--color');
    const swatch = document.createElement('span');
    swatch.className = 'chip-swatch';
    swatch.style.background = resolved || 'transparent';
    chip.append(swatch);
    const value = document.createElement('span');
    value.className = 'chip-value';
    value.textContent = resolved.toLowerCase();
    chip.append(value);
  } else {
    chip.classList.add('token-chip--num');
    const value = document.createElement('span');
    value.className = 'chip-value';
    value.textContent = resolved;
    chip.append(value);
  }
  chip.title = `${info.scopeName}.${info.name}`;
}

function updateChips() {
  document.querySelectorAll<HTMLElement>('.token-chip').forEach(renderChip);
}

// ---------------------------------------------------------------------------
// 4. Popover
// ---------------------------------------------------------------------------

const popoverRoot = document.getElementById('popover-root')!;
let activePopover: HTMLElement | null = null;
let activeChip: HTMLElement | null = null;

function detachPopover(popover: HTMLElement) {
  popover.remove();
  if (activePopover === popover) {
    activePopover = null;
    activeChip = null;
  }
}

function closePopover() {
  if (activePopover) {
    const currentPopover = activePopover;

    // hdr-color-input exposes close() on the host element and emits a
    // close event once its internal popover actually shuts down. Use that
    // path instead of removing the wrapper immediately so the top-layer
    // overlay cannot get stranded and trap later clicks.
    const picker = activePopover.querySelector('color-input') as
      | (HTMLElement & { close?: () => void })
      | null;
    if (picker && typeof picker.close === 'function') {
      try {
        currentPopover.style.pointerEvents = 'none';
        picker.close();
        activePopover = null;
        activeChip = null;
        return;
      } catch {
        // ignore — best-effort cleanup
      }
    }

    detachPopover(currentPopover);
    return;
  }

  activeChip = null;
}

function positionPopover(pop: HTMLElement, chip: HTMLElement) {
  const rect = chip.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 280, rect.left))}px`;
  pop.style.top = `${rect.bottom + 8}px`;
}

function openPopover(chip: HTMLElement) {
  closePopover();

  const info = getChipInfo(chip);
  if (!info) return;

  const pop = document.createElement('div');
  pop.className = 'popover';

  if (info.kind === 'fn-option') {
    buildFnOptionUI(pop, info, chip);
  } else {
    const scope = book.getScope(info.scopeName);
    if (!scope) return;
    const tok = scope.get(info.name);
    if (!tok) return;

    // Colors get a bare picker — no popover chrome — since the picker IS
    // the UI. Routing it through openColorPicker bypasses the labelled
    // popover entirely.
    if (tok.type === 'color') {
      openColorPicker(chip, info.scopeName, info.name);
      return;
    }

    // Ref chips with `data-quick-color` skip the re-point list and open the
    // picker for the underlying primitive value instead. Useful inline in
    // prose where the point is "change this colour" rather than "choose
    // which token to point at."
    if (tok.type === 'reference' && chip.dataset.quickColor !== undefined) {
      const prim = resolveToPrimitive(info.scopeName, info.name);
      if (prim) {
        const primTok = book.getScope(prim.scopeName)?.get(prim.name);
        if (primTok?.type === 'color') {
          openColorPicker(chip, prim.scopeName, prim.name);
          return;
        }
      }
    }

    const label = document.createElement('div');
    label.className = 'popover-title';
    label.textContent = `${info.scopeName}.${info.name}`;
    pop.append(label);

    if (tok.type === 'reference') {
      // Reference tokens are decisions about what to point at. Editing one
      // means re-pointing it at a different token of compatible type, not
      // changing the destination's value.
      buildRefUI(pop, info.scopeName, info.name);
    } else if (tok.type === 'dimension') {
      buildDimensionUI(pop, info.scopeName, info.name, chip);
    } else {
      const note = document.createElement('div');
      note.className = 'popover-note';
      note.textContent = `Editing tokens of type "${tok.type}" isn't supported in this demo.`;
      pop.append(note);
    }
  }

  popoverRoot.append(pop);
  positionPopover(pop, chip);
  activePopover = pop;
  activeChip = chip;
}

function openColorPicker(chip: HTMLElement, scopeName: string, name: string) {
  const scope = book.getScope(scopeName)!;
  let current = '#000000';
  try {
    const resolved = book.resolve(`${scopeName}.${name}`);
    if (/^#[0-9a-f]{6}$/i.test(resolved)) current = resolved;
  } catch {
    // leave default
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'color-picker-wrapper';

  const picker = document.createElement('color-input') as HTMLElement & {
    value: string;
    show?: () => void;
    close?: () => void;
  };
  picker.value = current;
  picker.setAttribute('no-alpha', '');
  wrapper.append(picker);

  picker.addEventListener('close', () => {
    detachPopover(wrapper);
  }, { once: true });

  popoverRoot.append(wrapper);
  positionPopover(wrapper, chip);
  activePopover = wrapper;
  activeChip = chip;

  picker.addEventListener('change', () => {
    if (!picker.value) return;
    try {
      scope.set(name, color(picker.value));
    } catch (err) {
      console.warn('[article] invalid color', picker.value, err);
    }
  });

  // Open the picker panel immediately — we're inside the chip-click gesture.
  requestAnimationFrame(() => {
    if (typeof picker.show === 'function') picker.show();
  });
}

function buildDimensionUI(pop: HTMLElement, scopeName: string, name: string, chip: HTMLElement) {
  const scope = book.getScope(scopeName)!;
  const tok = scope.get(name) as TokenValue;
  const unit = (tok.metadata?.unit as string | undefined) ?? '';
  const currentNum = Number(tok.rawValue);

  const min = Number(chip.dataset.min ?? Math.max(0, currentNum - 16));
  const max = Number(chip.dataset.max ?? currentNum + 16);
  const step = Number(chip.dataset.step ?? 1);

  const wrap = document.createElement('div');
  wrap.className = 'slider-wrap';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(currentNum);

  const display = document.createElement('span');
  display.className = 'slider-value';
  display.textContent = `${currentNum}${unit}`;

  wrap.append(range, display);
  pop.append(wrap);

  range.addEventListener('input', () => {
    const v = Number(range.value);
    display.textContent = `${v}${unit}`;
    if (unit === 'px') {
      scope.set(name, px(v));
    } else {
      scope.set(name, { ...tok, rawValue: v } as TokenValue);
    }
  });
}

function buildFnOptionUI(
  pop: HTMLElement,
  info: Extract<ChipInfo, { kind: 'fn-option' }>,
  chip: HTMLElement,
) {
  const scope = book.getScope(info.scopeName);
  if (!scope) return;
  const tok = scope.get(info.name) as FunctionTokenValue | undefined;
  if (!tok || tok.type !== 'function') return;

  const label = document.createElement('div');
  label.className = 'popover-title';
  label.textContent = `${tok.name}( … ${info.optionName} )`;
  pop.append(label);

  const min = Number(chip.dataset.min ?? '0');
  const max = Number(chip.dataset.max ?? '1');
  const step = Number(chip.dataset.step ?? '0.01');
  const currentVal = Number((tok.options as Record<string, unknown> | undefined)?.[info.optionName] ?? 0);
  const displayDecimals = getDisplayDecimals(chip);

  const wrap = document.createElement('div');
  wrap.className = 'slider-wrap';

  const range = document.createElement('input');
  range.type = 'range';

  const display = document.createElement('span');
  display.className = 'slider-value';

  const snapValues = getSnapValuesForFnOption(tok, info.optionName);
  let currentIndex = -1;

  if (snapValues) {
    currentIndex = findClosestIndex(snapValues, currentVal);
    range.min = '0';
    range.max = String(snapValues.length - 1);
    range.step = '1';
    range.value = String(currentIndex);
    display.textContent = formatNumber(snapValues[currentIndex], displayDecimals);

    const note = document.createElement('div');
    note.className = 'popover-note';
    note.textContent = 'This control snaps to the contrast levels available in the current ramp.';
    pop.append(note);
  } else {
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(currentVal);
    display.textContent = formatNumber(currentVal, displayDecimals);
  }

  wrap.append(range, display);
  pop.append(wrap);

  range.addEventListener('input', () => {
    const v = snapValues
      ? snapValues[Math.max(0, Math.min(snapValues.length - 1, Number(range.value)))]
      : Number(range.value);
    display.textContent = formatNumber(v, displayDecimals);
    const fresh = scope.get(info.name) as FunctionTokenValue;
    const newOptions = { ...(fresh.options ?? {}), [info.optionName]: v };
    scope.set(info.name, { ...fresh, options: newOptions });
  });
}

function getSnapValuesForFnOption(tok: FunctionTokenValue, optionName: string): number[] | null {
  if (tok.name !== 'minContrastWith' || optionName !== 'ratio') return null;

  const [targetArg, candidateScope] = tok.args;
  const targetValue = resolveColorArg(targetArg);
  if (!targetValue) return null;

  const targetColor = parse(targetValue);
  if (!targetColor) return null;

  const scopeLike = candidateScope as { getAllKeys?: () => string[]; resolve?: (key: string) => string };
  if (typeof scopeLike.getAllKeys !== 'function' || typeof scopeLike.resolve !== 'function') {
    return null;
  }

  const values: number[] = [];
  for (const key of scopeLike.getAllKeys()) {
    try {
      const resolved = scopeLike.resolve(key);
      const candidateColor = parse(resolved);
      if (!candidateColor) continue;
      values.push(wcagContrast(targetColor, candidateColor));
    } catch {
      continue;
    }
  }

  values.sort((a, b) => a - b);

  const unique: number[] = [];
  for (const value of values) {
    if (!unique.some(existing => Math.abs(existing - value) < 0.01)) {
      unique.push(value);
    }
  }

  return unique.length > 1 ? unique : null;
}

function resolveColorArg(arg: unknown): string | null {
  if (typeof arg === 'string') {
    return parse(arg) ? arg : null;
  }

  if (typeof arg !== 'object' || arg === null || !('type' in arg)) {
    return null;
  }

  const token = arg as TokenValue | ReferenceValue;
  if ('key' in token && token.type === 'reference') {
    try {
      const resolved = book.resolve(token.key);
      return parse(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }

  if ('rawValue' in token) {
    const raw = String(token.rawValue);
    return parse(raw) ? raw : null;
  }

  return null;
}

function findClosestIndex(values: number[], target: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  values.forEach((value, index) => {
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function buildRefUI(pop: HTMLElement, scopeName: string, name: string) {
  const scope = book.getScope(scopeName)!;
  const tok = scope.get(name) as ReferenceValue;
  const currentTarget = tok.key;
  const selfKey = `${scopeName}.${name}`;
  const targetType = getPrimitiveType(scopeName, name);

  const hint = document.createElement('div');
  hint.className = 'popover-note';
  hint.textContent = `Pick a token to point at. Same-type (${targetType ?? 'unknown'}) only.`;
  pop.append(hint);

  const list = document.createElement('div');
  list.className = 'ref-list';

  for (const [sName, s] of trackedScopes) {
    const tokenEntries = Object.entries(s.allTokens());
    const groupRows: HTMLElement[] = [];

    for (const [tName] of tokenEntries) {
      const candKey = `${sName}.${tName}`;
      if (candKey === selfKey) continue; // no self-reference
      if (getPrimitiveType(sName, tName) !== targetType) continue;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ref-option';
      if (candKey === currentTarget) row.classList.add('ref-option--selected');

      if (targetType === 'color') {
        const sw = document.createElement('span');
        sw.className = 'ref-option-swatch';
        try {
          sw.style.background = book.resolve(candKey);
        } catch {
          sw.style.background = 'transparent';
        }
        row.append(sw);
      }

      const keyLabel = document.createElement('span');
      keyLabel.className = 'ref-option-key';
      keyLabel.textContent = candKey;
      row.append(keyLabel);

      row.addEventListener('click', () => {
        try {
          scope.set(name, ref(candKey));
          closePopover();
        } catch (err) {
          console.warn('[article] cannot re-point ref:', err);
          row.classList.add('ref-option--error');
          setTimeout(() => row.classList.remove('ref-option--error'), 1000);
        }
      });

      groupRows.push(row);
    }

    if (groupRows.length) {
      const header = document.createElement('div');
      header.className = 'ref-group-header';
      header.textContent = sName;
      list.append(header, ...groupRows);
    }
  }

  pop.append(list);
}

function getDisplayDecimals(chip: HTMLElement): number | undefined {
  const raw = chip.dataset.displayDecimals;
  if (raw === undefined) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;

  return Math.floor(value);
}

function formatNumber(n: number, decimals?: number): string {
  if (decimals !== undefined) return n.toFixed(decimals);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

// ---------------------------------------------------------------------------
// 5. Event wiring
// ---------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  if (activePopover && activePopover.contains(target)) return;

  const chip = target.closest<HTMLElement>('.token-chip');
  if (chip) {
    // Always (re)open: clicking the same chip while its popover is open
    // simply rebuilds the popover. Closing is via outside click or Escape.
    openPopover(chip);
    return;
  }

  closePopover();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopover();
});

window.addEventListener('scroll', () => {
  if (activePopover && activeChip) positionPopover(activePopover, activeChip);
}, { passive: true });

window.addEventListener('resize', () => {
  if (activePopover && activeChip) positionPopover(activePopover, activeChip);
});

// Reset button
document.getElementById('reset')?.addEventListener('click', () => {
  closePopover();
  for (const entry of defaults) {
    const scope = book.getScope(entry.scope);
    if (!scope) continue;
    if (entry.name.includes('.')) {
      // function option, e.g. "linkHover.amount"
      const [tokenName, optionName] = entry.name.split('.');
      const tok = scope.get(tokenName) as FunctionTokenValue | undefined;
      if (!tok || tok.type !== 'function') continue;
      const newOptions = { ...(tok.options ?? {}), [optionName]: entry.value };
      scope.set(tokenName, { ...tok, options: newOptions });
    } else {
      const tok = scope.get(entry.name) as TokenValue | undefined;
      if (!tok) continue;
      if (tok.type === 'color') {
        scope.set(entry.name, color(String(entry.value)));
      } else if (tok.type === 'dimension' && tok.metadata?.unit === 'px') {
        scope.set(entry.name, px(Number(entry.value)));
      } else {
        scope.set(entry.name, { ...tok, rawValue: entry.value } as TokenValue);
      }
    }
  }

  // Restore the scroll-triggered rewire to its starting ref so the §5 demo
  // can fire again the next time the reader scrolls into the subsection.
  unwireOnSurface();
  document.querySelectorAll('[data-rewire="onSurface"]').forEach((m) => {
    (m as HTMLElement).classList.remove('rewire-fired');
  });

  // Tear down the Poline-driven palette so the descriptive value tokens
  // are back and the section's intersection observer can re-fire on the
  // next scroll into view.
  deactivateProceduralPalette();

  // Reset the invert-lightness toggle and the Poline state behind it.
  polineState.invertedLightness = false;
  const invertToggle = document.getElementById('poline-invert') as HTMLInputElement | null;
  if (invertToggle) invertToggle.checked = false;
  const picker = document.getElementById('poline') as
    | (HTMLElement & { setPoline?: (p: Poline) => void })
    | null;
  if (picker && typeof picker.setPoline === 'function') picker.setPoline(polineState);
});

// Close the popover when the chip it belongs to scrolls off-screen, so a
// stale popover never floats in the middle of the article.
function closePopoverIfChipOffScreen() {
  if (!activeChip) return;
  const rect = activeChip.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    closePopover();
  }
}

window.addEventListener('scroll', closePopoverIfChipOffScreen, { passive: true });
window.addEventListener('resize', closePopoverIfChipOffScreen);

// ---------------------------------------------------------------------------
// 7. Scroll-triggered rewire of color.onSurface
// ---------------------------------------------------------------------------
//
// color.onSurface starts as a plain `ref('values.gray900')` — a decision
// pinned for the light surface. When the reader scrolls into the §5
// "onSurface as a rule" subsection, the token is rewired in place to
// `bestContrastWith(color.surface, values)`. The body text in the example
// panel re-decides itself for whatever surface is in play. Reset restores
// the original ref so the demo is repeatable.
//
// The observer stays attached: after a reset, scrolling back into the
// subsection re-fires the rewire.

function rewireOnSurface() {
  const current = colorScope.get('onSurface');
  if (current && current.type === 'function') return; // already rewired
  colorScope.set('onSurface', bestContrastWith(ref('color.surface'), values));
}

function unwireOnSurface() {
  const current = colorScope.get('onSurface');
  if (current && current.type === 'reference') return; // already a ref
  colorScope.set('onSurface', ref('values.gray900'));
}

const rewireMarkers = document.querySelectorAll<HTMLElement>('[data-rewire="onSurface"]');
if (rewireMarkers.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          rewireOnSurface();
          (entry.target as HTMLElement).classList.add('rewire-fired');
        }
      }
    },
    { rootMargin: '0px 0px -35% 0px' },
  );
  rewireMarkers.forEach((m) => observer.observe(m));
}

// Attach the Poline state to the §5 picker and listen for drags. The picker
// is in the DOM at boot, but it doesn't drive anything until the reader
// scrolls into the section — see the IntersectionObserver below.
const polinePicker = document.getElementById('poline') as
  | (HTMLElement & { setPoline?: (p: Poline) => void })
  | null;
if (polinePicker) {
  if (typeof polinePicker.setPoline === 'function') {
    polinePicker.setPoline(polineState);
  }
  polinePicker.addEventListener('poline-change', () => {
    // Activate on first drag too, in case the reader hits the picker before
    // its section enters the viewport (e.g. deep-linked or short page).
    if (!proceduralActivated) activateProceduralPalette();
    else syncPolineValues();
  });

  // Invert-lightness toggle. Flipping it mirrors the lightness axis of every
  // anchor — useful for stress-testing "what if the palette ran from dark
  // to light instead of light to dark?"
  const invertToggle = document.getElementById('poline-invert') as HTMLInputElement | null;
  if (invertToggle) {
    invertToggle.addEventListener('change', () => {
      polineState.invertedLightness = invertToggle.checked;
      // setPoline triggers an SVG + lightness-background refresh on the picker.
      if (typeof polinePicker.setPoline === 'function') {
        polinePicker.setPoline(polineState);
      }
      if (!proceduralActivated) activateProceduralPalette();
      else syncPolineValues();
    });
  }

  // Scroll-triggered activation: when the picker enters the reading area,
  // swap the descriptive value tokens for the Poline-driven palette.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activateProceduralPalette();
      }
    },
    { rootMargin: '0px 0px -35% 0px' },
  );
  observer.observe(polinePicker);
}

// ---------------------------------------------------------------------------
// Dependency graph (under the live example panel)
// ---------------------------------------------------------------------------
//
// SVGRenderer draws a circular layout of every scope + the edges between
// them, including the dashed function-token edges. We re-render on every
// `change` so the reader sees the graph reorganise as tokens get added,
// removed, or rewired (e.g. on §3 onSurface rewire, on §5 Poline activation).
const depGraphContainer = document.getElementById('dep-graph');
if (depGraphContainer) {
  const svgRenderer = new SVGRenderer(book, { linksOnly: true });
  const renderDepGraph = () => {
    depGraphContainer.innerHTML = svgRenderer.render();
  };
  book.on('change', renderDepGraph);
  renderDepGraph();
}

// ---------------------------------------------------------------------------
// Bezier curve editor (§5) — drives the spacing scale's multipliers
// ---------------------------------------------------------------------------
//
// Each `space.*` token is a `spacingScale(ref('space.base'), { multiplier })`
// function token. The bezier editor below maps step-positions along a
// cubic-bezier curve from (0,0) to (1,1), and writes the curve's y-value
// at each step (scaled into [MIN_MULT, MAX_MULT]) into the corresponding
// token's `multiplier` option. Drag the handles, the curve mutates, every
// spacing token updates, the example panel reshapes.

const bezierState = {
  p1: [0.42, 0.0] as [number, number],
  p2: [0.58, 1.0] as [number, number],
};

const BEZIER_STEPS: Array<[name: string, t: number]> = [
  ['xs', 0.00],
  ['s',  0.25],
  ['m',  0.50],
  ['l',  0.75],
  ['xl', 1.00],
];
const BEZIER_MIN_MULT = 0.25;
const BEZIER_MAX_MULT = 3;

function cubicBezierY(t: number, p1y: number, p2y: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t;
}

function cubicBezierPoint(t: number, p1: [number, number], p2: [number, number]): [number, number] {
  const u = 1 - t;
  const x = 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t;
  const y = 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t;
  return [x, y];
}

function syncSpaceFromCurve() {
  for (const [name, t] of BEZIER_STEPS) {
    const y = cubicBezierY(t, bezierState.p1[1], bezierState.p2[1]);
    const multiplier = BEZIER_MIN_MULT + (BEZIER_MAX_MULT - BEZIER_MIN_MULT) * y;
    const current = space.get(name);
    if (current?.type !== 'function') continue;
    const fn = current as FunctionTokenValue;
    space.set(name, {
      ...fn,
      options: { ...(fn.options ?? {}), multiplier },
    });
  }
}

const bezierSvg = document.getElementById('bezier-svg') as SVGSVGElement | null;
if (bezierSvg) {
  const SVG_W = 200;
  const SVG_H = 150;
  const PAD = 15;

  function bezierToSvg(x: number, y: number): [number, number] {
    return [
      PAD + x * (SVG_W - 2 * PAD),
      SVG_H - PAD - y * (SVG_H - 2 * PAD),
    ];
  }

  function svgEventToBezier(e: PointerEvent): [number, number] {
    const rect = bezierSvg!.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const svgY = ((e.clientY - rect.top) / rect.height) * SVG_H;
    return [
      Math.max(0, Math.min(1, (svgX - PAD) / (SVG_W - 2 * PAD))),
      Math.max(0, Math.min(1, (SVG_H - PAD - svgY) / (SVG_H - 2 * PAD))),
    ];
  }

  function renderBezier() {
    const [p0x, p0y] = bezierToSvg(0, 0);
    const [p3x, p3y] = bezierToSvg(1, 1);
    const [p1x, p1y] = bezierToSvg(bezierState.p1[0], bezierState.p1[1]);
    const [p2x, p2y] = bezierToSvg(bezierState.p2[0], bezierState.p2[1]);

    // Sample dots — one per spacing step, drawn on the curve so the reader
    // can see which step maps where.
    const dots = BEZIER_STEPS.map(([, t]) => {
      const [bx, by] = cubicBezierPoint(t, bezierState.p1, bezierState.p2);
      const [sx, sy] = bezierToSvg(bx, by);
      return `<circle cx="${sx}" cy="${sy}" r="3" fill="var(--article-text)" />`;
    }).join('');

    bezierSvg!.innerHTML = `
      <g vector-effect="non-scaling-stroke">
        <!-- Reference frame -->
        <rect x="${PAD}" y="${PAD}" width="${SVG_W - 2 * PAD}" height="${SVG_H - 2 * PAD}"
              fill="none" stroke="var(--article-rule)" stroke-width="1"
              vector-effect="non-scaling-stroke" />
        <!-- Control lines -->
        <line x1="${p0x}" y1="${p0y}" x2="${p1x}" y2="${p1y}"
              stroke="var(--article-muted)" stroke-width="1" stroke-dasharray="3,3"
              vector-effect="non-scaling-stroke" />
        <line x1="${p3x}" y1="${p3y}" x2="${p2x}" y2="${p2y}"
              stroke="var(--article-muted)" stroke-width="1" stroke-dasharray="3,3"
              vector-effect="non-scaling-stroke" />
        <!-- Curve -->
        <path d="M ${p0x} ${p0y} C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3x} ${p3y}"
              fill="none" stroke="var(--article-accent)" stroke-width="2"
              vector-effect="non-scaling-stroke" />
        <!-- Step dots -->
        ${dots}
        <!-- Handles -->
        <circle data-handle="p1" cx="${p1x}" cy="${p1y}" r="7"
                fill="var(--article-surface)" stroke="var(--article-accent)" stroke-width="2"
                vector-effect="non-scaling-stroke" style="cursor: grab;" />
        <circle data-handle="p2" cx="${p2x}" cy="${p2y}" r="7"
                fill="var(--article-surface)" stroke="var(--article-accent)" stroke-width="2"
                vector-effect="non-scaling-stroke" style="cursor: grab;" />
      </g>
    `;
  }

  let draggingHandle: 'p1' | 'p2' | null = null;

  bezierSvg.addEventListener('pointerdown', (e) => {
    const target = e.target as SVGElement | null;
    const handle = target?.getAttribute?.('data-handle');
    if (handle !== 'p1' && handle !== 'p2') return;
    draggingHandle = handle;
    bezierSvg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  bezierSvg.addEventListener('pointermove', (e) => {
    if (!draggingHandle) return;
    const [bx, by] = svgEventToBezier(e);
    bezierState[draggingHandle] = [bx, by];
    renderBezier();
    syncSpaceFromCurve();
  });

  const stopDrag = (e: PointerEvent) => {
    if (!draggingHandle) return;
    bezierSvg.releasePointerCapture(e.pointerId);
    draggingHandle = null;
  };
  bezierSvg.addEventListener('pointerup', stopDrag);
  bezierSvg.addEventListener('pointercancel', stopDrag);

  renderBezier();
  syncSpaceFromCurve();
}

// ---------------------------------------------------------------------------
// 6. Boot
// ---------------------------------------------------------------------------

syncCss();
