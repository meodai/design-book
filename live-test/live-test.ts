/* live-test — token-beam receiver that themes a generic page via design-book.
 *
 * Colors beamed from any token-beam source land in the `beam` scope
 * (kept perceptually sorted via the scope's own order). The `ui` scope
 * derives every color the page actually uses — text, surfaces, borders,
 * accents — through design-book functions, and the whole book is rendered
 * to CSS custom properties on every change.
 */

import {
  DesignBook,
  SVGRenderer,
  color,
  ref,
  mostVivid,
  leastVivid,
  minContrastWith,
  furthestFrom,
  closestColor,
  relativeTo,
  lighten,
  darken,
  shade,
  nth,
  colorMix,
  ramp,
} from '../src/index';

import {
  TargetSession,
  normalizeSessionToken,
  extractColorTokens,
} from 'token-beam';

// ── The book ─────────────────────────────────────────────────────

// Batch mode so a beamed palette applies as one atomic flush — derived
// tokens never resolve against a half-replaced scope.
const book = new DesignBook('live-test', { mode: 'batch' });

// Contrast anchors: the only two colors on the page that are not beamed
// or derived. They exist so text pickers always have a readable candidate
// even when the beamed palette is all mid-tones.
const base = book.addScope('base');
base.set('ink', color('#141414'));
base.set('paper', color('#fbfbf8'));

// Raw beamed palette — kept exactly in arrival order; the source's own
// sequence is part of the palette.
const beam = book.addScope('beam');

// Candidate pool for contrast picking: the beamed palette plus the anchors.
const pool = book.addScope('pool', { extends: 'beam' });
pool.set('ink', ref('base.ink'));
pool.set('paper', ref('base.paper'));

// Everything the page uses, split into semantic scopes. Text colors are
// picked with minContrastWith from `pool`: among all candidates that
// clear the ratio it takes the LOWEST-contrast one — the most
// palette-flavored color that is still readable. The ink/paper anchors
// in the pool are the safety net: they only win when no beamed color
// clears the bar (e.g. an all-mid-tone palette).

// Surfaces — everything you stand on. The seed is the palette's most
// muted color; bg/card/panel are ramp steps of it, set by applyMode().
const surface = book.addScope('surface');
surface.set('seed', leastVivid(beam));
surface.set('border', colorMix(ref('surface.bg'), ref('text.body'), { ratio: 0.18 }));
surface.set('code', colorMix(ref('surface.card'), ref('surface.border'), { ratio: 0.45 }));

// Text — what you read. Body ratio is 10 rather than the AAA-minimum 7:
// at 7 the pick can land on "barely sufficient" colors (a 7.5:1 orange
// reads as decoration, not text).
const text = book.addScope('text');
text.set('body', minContrastWith(ref('surface.bg'), pool, { ratio: 10 }));
text.set('muted', colorMix(ref('surface.bg'), ref('text.body'), { ratio: 0.7 }));
text.set('on-panel', minContrastWith(ref('surface.panel'), pool, { ratio: 4.5 }));

// Action — what you click. Primary is the palette's most vivid, full
// stop; the text on it is a palette color whenever one clears 7:1 —
// the ink/paper anchors in the pool only win when nothing beamed has
// enough delta. The focus ring is a synthesized complement (accent
// rotated in OKLCH), related to the palette without being in it.
// shade() adapts to its input's lightness, so `active` needs no mode
// handling.
const action = book.addScope('action');
action.set('primary', mostVivid(beam));
action.set('on-primary', minContrastWith(ref('action.primary'), pool, { ratio: 7 }));
action.set('link', darken(ref('action.primary'), { amount: 0.12 }));
action.set('active', shade(ref('action.primary'), { amount: 0.2 }));
action.set('focus', relativeTo(ref('action.primary'), 'oklch', [0.62, 0.18, '+160']));

// Ramp — one accent, a whole tonal family (the barchart's bars).
const accentRamp = book.addScope('ramp');
for (const step of ['300', '400', '500', '600', '800']) {
  accentRamp.set(step, ramp(ref('action.primary'), { shade: step }));
}

// State — the palette's own semantics: its red-est and green-est colors.
const state = book.addScope('state');
state.set('error', closestColor(color('#c0392b'), beam));
state.set('success', closestColor(color('#1e8e4d'), beam));

// Decor — badge and chips; the palette's odd one out and three spreads.
const decor = book.addScope('decor');
decor.set('badge', furthestFrom(beam));
decor.set('on-badge', minContrastWith(ref('decor.badge'), pool, { ratio: 4.5 }));
decor.set('chip-1', nth(beam, 0.15));
decor.set('chip-2', nth(beam, 0.5));
decor.set('chip-3', nth(beam, 0.85));

// ── Light/dark mode: the same derivation logic, inverted ─────────
// Light mode reads the ramps near their light end (bg 100, card 50);
// dark mode reads the same ramps near the dark end (bg 950, card 900 —
// cards stay one step ELEVATED from the background either way). Text
// pickers depend on surface.bg, so they re-pick on their own.
function applyMode(dark: boolean) {
  surface.set('bg', ramp(ref('surface.seed'), { shade: dark ? '950' : '100' }));
  surface.set('card', ramp(ref('surface.seed'), { shade: dark ? '900' : '50' }));
  surface.set('panel', ramp(ref('action.primary'), { shade: dark ? '900' : '100' }));
  surface.set('panel-border', ramp(ref('action.primary'), { shade: dark ? '800' : '200' }));
  surface.set(
    'input',
    dark
      ? darken(ref('surface.panel'), { amount: 0.06 })
      : lighten(ref('surface.panel'), { amount: 0.06 }),
  );
  action.set('hover', ramp(ref('action.primary'), { shade: dark ? '400' : '700' }));
  document.documentElement.classList.toggle('is-dark', dark);
}

let darkMode = localStorage.getItem('live-test-dark') === '1';
applyMode(darkMode);

// ── Palette application ──────────────────────────────────────────

function sanitizeKey(name: string, i: number): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key || `color-${i}`;
}

function applyPalette(colors: { name: string; hex: string }[]) {
  // First-wins dedupe (first mode of a multi-mode payload is the default).
  const incoming = new Map<string, string>();
  colors.forEach((c, i) => {
    let key = sanitizeKey(c.name, i);
    while (incoming.has(key)) key += '-b';
    incoming.set(key, c.hex);
  });
  if (incoming.size === 0) return; // never empty the scope

  // Set new/updated tokens first, delete leftovers after — the scope is
  // never empty mid-apply, so scope-iterating functions always have a pool.
  for (const [key, hex] of incoming) {
    try {
      beam.set(key, color(hex));
    } catch {
      /* unparseable color — skip token */
    }
  }
  for (const key of [...beam.getAllKeys()]) {
    if (!incoming.has(key)) beam.delete(key);
  }

  book.flush();
  renderAll();
}

// ── Render: book → CSS custom properties + swatch strip ─────────

const styleEl = document.createElement('style');
styleEl.id = 'live-vars';
document.head.appendChild(styleEl);

const paletteEl = document.getElementById('beam-palette')!;
const graphEl = document.getElementById('dep-graph')!;

function renderAll() {
  try {
    styleEl.textContent = book.render('css-variables');
  } catch (e) {
    console.warn('[live-test] render failed:', e);
    return;
  }

  try {
    graphEl.innerHTML = new SVGRenderer(book, {
      showConnections: true,
      interactive: true,
    }).render();
  } catch (e) {
    console.warn('[live-test] svg graph render failed:', e);
  }

  paletteEl.innerHTML = '';
  for (const key of beam.getAllKeys()) {
    try {
      const hex = beam.resolve(key);
      const el = document.createElement('div');
      el.className = 'swatch';
      el.style.background = hex;
      el.title = `beam.${key} — ${hex}`;
      paletteEl.appendChild(el);
    } catch {
      /* unresolvable token — no swatch */
    }
  }
}

// Seed so the page has a theme before anything is beamed.
applyPalette([
  { name: 'porcelain', hex: '#e9e4d8' },
  { name: 'verdigris', hex: '#3e8e7e' },
  { name: 'marigold', hex: '#e8a13c' },
  { name: 'oxblood', hex: '#6d2331' },
  { name: 'nightshade', hex: '#2b2d42' },
]);

// ── token-beam session ───────────────────────────────────────────

const form = document.getElementById('beam-form') as HTMLFormElement;
const codeInput = document.getElementById('beam-code') as HTMLInputElement;
const dot = document.getElementById('beam-dot')!;
const stateLabel = document.getElementById('beam-state-label')!;

let session: TargetSession | null = null;

function setStatus(state: string, label: string) {
  dot.dataset.state = state;
  stateLabel.textContent = label;
}

async function connect(rawCode: string) {
  const sessionToken = normalizeSessionToken(rawCode);
  if (!sessionToken) {
    setStatus('error', 'invalid code — expected beam://XXXXXX');
    return;
  }

  session?.disconnect();
  // clientType is left at the library default ('receiver') — the sync
  // server routes payloads by role, so an unknown clientType pairs fine
  // but never receives sync messages.
  session = new TargetSession({
    sessionToken,
    origin: 'design-book live-test',
    icon: { type: 'unicode', value: '📖' },
  });

  session.on('state', ({ current }) => {
    const labels: Record<string, string> = {
      connecting: 'connecting…',
      connected: 'connected — waiting for source',
      paired: 'paired — waiting for tokens',
      disconnected: 'disconnected',
      error: 'connection error',
    };
    if (labels[current]) setStatus(current, labels[current]);
  });

  session.on('sync', ({ payload }) => {
    const colors = extractColorTokens(payload);
    if (colors.length === 0) {
      setStatus('paired', 'payload had no colors');
      return;
    }
    applyPalette(colors.map((c) => ({ name: c.token.name, hex: c.hex })));
    setStatus('paired', `receiving — ${beam.getAllKeys().length} colors`);
  });

  session.on('peer-disconnected', ({ clientType }) => {
    setStatus('connected', `source left (${clientType})`);
  });

  session.on('error', ({ message }) => setStatus('error', message));
  session.on('warning', ({ message }) => console.warn('[token-beam]', message));

  try {
    setStatus('connecting', 'connecting…');
    await session.connect();
    localStorage.setItem('live-test-beam-code', rawCode);
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : 'connection failed');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (code) connect(code);
});

// Prefill the last-used code (no auto-connect — sessions expire).
const lastCode = localStorage.getItem('live-test-beam-code');
if (lastCode) codeInput.value = lastCode;

// ── Fake form: shows the palette-derived error/success states ────

const panelForm = document.getElementById('panel-form') as HTMLFormElement;
const nameInput = document.getElementById('f-name') as HTMLInputElement;
const formNote = document.getElementById('form-note')!;

panelForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!nameInput.value.trim()) {
    nameInput.classList.add('is-invalid');
    formNote.textContent = 'A name would help — even a made-up one.';
    formNote.className = 'form-note is-error';
  } else {
    nameInput.classList.remove('is-invalid');
    formNote.textContent = `Subscribed, ${nameInput.value.trim()} — in palette-appropriate green.`;
    formNote.className = 'form-note is-success';
  }
});

nameInput.addEventListener('input', () => nameInput.classList.remove('is-invalid'));

// ── Dark mode toggle ─────────────────────────────────────────────

const modeBtn = document.getElementById('mode-toggle')!;

function syncModeBtn() {
  modeBtn.textContent = darkMode ? '○ light' : '● dark';
}

modeBtn.addEventListener('click', () => {
  darkMode = !darkMode;
  localStorage.setItem('live-test-dark', darkMode ? '1' : '0');
  applyMode(darkMode);
  book.flush();
  renderAll();
  syncModeBtn();
});

syncModeBtn();
