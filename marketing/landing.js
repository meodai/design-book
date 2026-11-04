// Design Book: landing page.
// One small book drives the whole page: the sentence in the hero, the
// ledger, and the three readings. Every pill and every color input writes
// to that book; the page only reads back what it resolves to.

import { converter, formatHex, parse, wcagContrast } from "culori";
import { Poline, positionFunctions } from "poline/picker"; // also defines <poline-picker>
import { generateColorRamp, colorUtils } from "rampensau";
import "./sliders.js";
import "hdr-color-input";
import { highlight } from "sugar-high";
import {
  DesignBook,
  color,
  ref,
  darkest,
  lightest,
  mostVivid,
  closest,
  nextLarger,
  largest,
  smallest,
  px,
  leastVivid,
  bestContrastWith,
  minContrastWith,
  colorMix,
  nth,
  rampStops,
  scaleNames,
} from "../src/index";

const oklch = converter("oklch");

// ─── Palettes ────────────────────────────────────────────────────────
// The book never invents colors; something outside it supplies them. Here
// that is Poline: each palette is a single line between two points on a
// color wheel, drawn with the picker next to the ledger. The ends come from
// old account books and printed plates: ruled ledger paper and its ink,
// foxed book paper, and cyanotype blues.
// Each palette is one Poline line through six anchors, in this order:
// paper, yellow, red, green, blue and black (or that palette's own take on
// them), with one color between each pair: eleven colors in all, the
// anchors at positions 0, 2, 4, 6, 8 and 10.
const SEEDS = {
  ledger: ["#eee9dc", "#dab43d", "#de5331", "#479549", "#3c61a0", "#0d0a03"],
  foxed: ["#f1e6cc", "#d9a441", "#b5482a", "#6b7a3a", "#4f5a7a", "#2b1a12"],
  cyanotype: ["#eef2f3", "#c8d9a0", "#c9634f", "#2f8f87", "#2f6f9f", "#081626"],
};
const hsl = converter("hsl");

const POLINES = Object.fromEntries(
  Object.entries(SEEDS).map(([name, seeds]) => [
    name,
    new Poline({
      anchorColors: seeds.map((hex) => {
        const c = hsl(hex);
        return [c.h ?? 0, c.s ?? 0, c.l];
      }),
      numPoints: 1,
      // Evenly spaced between the anchors, not eased toward them.
      positionFunction: positionFunctions.linearPosition,
    }),
  ]),
);

// Where a palette's colors come from. The rules never care: they read
// whatever the scope holds.
//   poline  — a Poline line through the six anchors (turn the wheel)
//   hand    — eleven colors picked one by one (each swatch is a picker)
//   ramp    — a RampenSau hue ramp from light to dark (move its start hue)
const SOURCES = ["poline", "hand", "ramp"];
const SOURCE_WORDS = {
  poline: "drawn with Poline",
  hand: "picked by hand",
  ramp: "generated as a ramp with RampenSau",
};
let source = "poline";

const polineHexes = (name) => POLINES[name].colorsCSS.map((css) => formatHex(parse(css)));

/** The hand-picked palettes start as Poline drew them, then are the
 *  reader's to change. */
const HAND = Object.fromEntries(Object.keys(SEEDS).map((name) => [name, polineHexes(name)]));

/** RampenSau: one turn round the hue circle, from paper-light to ink-dark,
 *  starting at the hue of the palette's second anchor. */
const RAMP_START = Object.fromEntries(
  Object.entries(SEEDS).map(([name, seeds]) => [name, Math.round(hsl(seeds[1]).h ?? 0)]),
);
function rampHexes(name) {
  return generateColorRamp({
    total: 11,
    hStart: RAMP_START[name],
    hCycles: 1,
    sRange: [0.35, 0.75],
    lRange: [0.92, 0.06],
  }).map((c) => formatHex(parse(colorUtils.colorToCSS(c, "hsl"))));
}

function paletteHexes(name) {
  if (source === "hand") return HAND[name];
  if (source === "ramp") return rampHexes(name);
  return polineHexes(name);
}

/** Write a palette's colors into its scope, named alpha, beta, …; drop
 *  members left over from a longer palette. */
function fillPalette(name) {
  const scope = book.getScope(name);
  const hexes = paletteHexes(name);
  const names = scaleNames(hexes.length, "greek");
  names.forEach((key, i) => scope.set(key, color(hexes[i])));
  for (const key of scope.ownKeys()) if (!names.includes(key)) scope.delete(key);
}

const PALETTES = SEEDS; // the names the sentence offers

// ─── The choices the sentence offers ─────────────────────────────────
const CHOICES = {
  fn1: ["lightest", "darkest", "mostVivid", "leastVivid"],
  pal1: Object.keys(PALETTES),
  fn2: ["bestContrastWith", "minContrastWith"],
  pal2: Object.keys(PALETTES),
  // Who reads the rules. Only words: it changes nothing in the book.
  who: [
    "designers, developers and language models",
    "designers, developers and LLMs",
    "generative artists and their sketches",
    "artists who draw with code",
    "designers and developers",
    "a designer and a language model",
    "developers and their coding agents",
    "you and your future self",
  ],
};
// Dark mode is the same book with one rule changed: the ground becomes the
// darkest color instead of the lightest. It follows the system setting
// until the reader picks a rule in the sentence themselves.
const darkScheme = matchMedia("(prefers-color-scheme: dark)");
const state = {
  who: CHOICES.who[0],
  fn1: darkScheme.matches ? "darkest" : "lightest",
  pal1: "ledger",
  fn2: "bestContrastWith",
  pal2: "ledger",
};
let fn1Chosen = false;

const PICKERS = { darkest, lightest, mostVivid, leastVivid };
const CONTRASTERS = {
  bestContrastWith: (pool) => bestContrastWith(ref("ui.ground"), ref(pool)),
  minContrastWith: (pool) => minContrastWith(ref("ui.ground"), ref(pool), { minContrast: 4.5 }),
};

// ─── The book ────────────────────────────────────────────────────────
const book = new DesignBook("landing");
for (const name of Object.keys(SEEDS)) {
  book.addScope(name);
  fillPalette(name);
}
const ui = book.addScope("ui");
// Two ramps, eleven steps each, grown from two hues: the mark's and
// the paper's. The marks in the sentence choose from them by contrast.
const marks = book.addScope("marks");


// ─── Sizes ───────────────────────────────────────────────────────────
// Eight sizes between two ends, spread by a curve the reader can bend
// (a cubic bezier from the first size to the last, as in CSS easing).
// The page's own type sizes are rules that pick from this scale.
const SIZE_RANGE = [11, 56];
const SIZE_STEPS = 8;
const curve = { x1: 0.5, y1: 0.05, x2: 0.85, y2: 0.45 };
const sizes = book.addScope("sizes");

/** y of the curve where its x equals `x`, found by bisection on t. */
function curveAt(x) {
  const bez = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, curve.x1, curve.x2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, curve.y1, curve.y2);
}

function sizeValues() {
  const [min, max] = SIZE_RANGE;
  return Array.from({ length: SIZE_STEPS }, (_, i) =>
    Math.round(min + (max - min) * curveAt(i / (SIZE_STEPS - 1))));
}

function fillSizes() {
  const names = scaleNames(SIZE_STEPS, "tshirt");
  sizeValues().forEach((value, i) => sizes.set(names[i], px(value)));
}
fillSizes();

function writeRules() {
  ui.set("ground", PICKERS[state.fn1](ref(state.pal1)));
  ui.set("ink", CONTRASTERS[state.fn2](state.pal2));
  ui.set("accent", mostVivid(ref(state.pal1), { readableOn: ref("ui.ground"), readableContrast: 3 }));
  ui.set("rule", colorMix(ref("ui.ink"), ref("ui.ground"), { ratio: 0.6, colorSpace: "oklch" }));
  // The papers and the mark are anchors of the first palette, by position.
  ui.set("mark", nth(ref(state.pal1), 9));
  ui.set("paper-dark", darkest(ref(state.pal1)));
  ui.set("paper-red", nth(ref(state.pal1), 4));
  ui.set("paper-yellow", nth(ref(state.pal1), 2));
  ui.set("paper-green", nth(ref(state.pal1), 6));
  // Text on each of them is the step of two ramps (from the mark and from
  // the ground, plus black) that contrasts with it most.
  for (const [key, token] of Object.entries({
    ...rampStops(ref("ui.mark"), { prefix: "hue-" }),
    ...rampStops(ref("ui.ground"), { prefix: "paper-" }),
  })) marks.set(key, token);
  marks.set("black", ref("ui.paper-dark"));
  ui.set("on-mark", bestContrastWith(ref("ui.mark"), ref("marks")));
  ui.set("on-paper-dark", bestContrastWith(ref("ui.paper-dark"), ref("marks")));
  ui.set("on-paper-red", bestContrastWith(ref("ui.paper-red"), ref("marks")));
  ui.set("on-paper-yellow", bestContrastWith(ref("ui.paper-yellow"), ref("marks")));
  ui.set("on-paper-green", bestContrastWith(ref("ui.paper-green"), ref("marks")));
  // The page's type sizes, read off the size scale.
  ui.set("small", smallest(ref("sizes")));
  ui.set("body", closest(px(18), ref("sizes")));
  ui.set("subhead", nextLarger(ref("ui.body"), ref("sizes")));
  ui.set("heading", nextLarger(ref("ui.subhead"), ref("sizes")));
  ui.set("title", largest(ref("sizes")));
  // Spacing reads the same scale: the row that every line, ruling, padding
  // and gap on the page is a multiple of.
  ui.set("row", closest(px(28), ref("sizes")));
}

/** Resolve a key; an error becomes `{ error }` so the page can say why. */
function read(key) {
  try {
    return { value: book.resolve(key) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Describing rules ────────────────────────────────────────────────
const COLOR_KEYS = ["ground", "ink", "accent", "rule", "mark", "on-mark", "paper-dark", "on-paper-dark", "paper-red", "on-paper-red", "paper-yellow", "on-paper-yellow", "paper-green", "on-paper-green"];
const SIZE_KEYS = ["small", "body", "subhead", "heading", "title", "row"];
// The Rules table is split into sections, each opened by a heading row.
const RULE_GROUPS = { ground: "Color", small: "Typography", row: "Space" };
// The Rules table shows the rules worth reading; the rest repeat one of
// them on another step (the other papers, their text colors, the other
// headings) and are counted at the end of their section. The sheets and
// the graph still show every rule.
const RULE_TABLE = {
  Color: { show: ["ground", "ink", "accent", "rule", "mark", "on-mark", "paper-dark"], more: "the red, yellow and green papers and the text on each: the same nth and bestContrastWith on other steps" },
  Typography: { show: ["small", "body", "subhead", "title"], more: "heading: nextLarger again, from subhead" },
  Space: { show: ["row"] },
};
const SHOWN_RULES = Object.values(RULE_TABLE).flatMap((g) => g.show);
/** The section a ui key belongs to, by where it sits in UI_KEYS. */
function groupOf(key) {
  if (SIZE_KEYS.includes(key)) return key === "row" ? "Space" : "Typography";
  return "Color";
}
const UI_KEYS = [...COLOR_KEYS, ...SIZE_KEYS];

function ruleSource(key) {
  switch (key) {
    case "ground":
      return `${state.fn1}(ref('${state.pal1}'))`;
    case "ink":
      return state.fn2 === "minContrastWith"
        ? `minContrastWith(ref('ui.ground'), ref('${state.pal2}'), { minContrast: 4.5 })`
        : `bestContrastWith(ref('ui.ground'), ref('${state.pal2}'))`;
    case "accent":
      return `mostVivid(ref('${state.pal1}'), { readableOn: ref('ui.ground'), readableContrast: 3 })`;
    case "rule":
      return `colorMix(ref('ui.ink'), ref('ui.ground'), { ratio: 0.6, colorSpace: 'oklch' })`;
    case "mark":
      return `nth(ref('${state.pal1}'), 9)`;
    case "on-mark":
      return `bestContrastWith(ref('ui.mark'), ref('marks'))`;
    case "paper-dark":
      return `darkest(ref('${state.pal1}'))`;
    case "on-paper-dark":
      return `bestContrastWith(ref('ui.paper-dark'), ref('marks'))`;
    case "paper-red":
      return `nth(ref('${state.pal1}'), 4)`;
    case "on-paper-red":
      return `bestContrastWith(ref('ui.paper-red'), ref('marks'))`;
    case "paper-yellow":
      return `nth(ref('${state.pal1}'), 2)`;
    case "on-paper-yellow":
      return `bestContrastWith(ref('ui.paper-yellow'), ref('marks'))`;
    case "paper-green":
      return `nth(ref('${state.pal1}'), 6)`;
    case "on-paper-green":
      return `bestContrastWith(ref('ui.paper-green'), ref('marks'))`;
    case "small":
      return `smallest(ref('sizes'))`;
    case "body":
      return `closest(px(18), ref('sizes'))`;
    case "subhead":
      return `nextLarger(ref('ui.body'), ref('sizes'))`;
    case "heading":
      return `nextLarger(ref('ui.subhead'), ref('sizes'))`;
    case "title":
      return `largest(ref('sizes'))`;
    case "row":
      return `closest(px(28), ref('sizes'))`;
  }
  return "";
}

const PICK_WORDS = {
  darkest: "the darkest color",
  lightest: "the lightest color",
  mostVivid: "the most vivid color",
  leastVivid: "the quietest color",
};

function ruleWords(key) {
  switch (key) {
    case "ground":
      return `${PICK_WORDS[state.fn1]} in ${state.pal1}.`;
    case "ink":
      return state.fn2 === "minContrastWith"
        ? `the color in ${state.pal2} closest to ground that still reaches 4.5:1.`
        : `the color in ${state.pal2} that contrasts most with ground.`;
    case "accent":
      return `the most vivid color in ${state.pal1} that still reaches 3:1 on ground.`;
    case "rule":
      return `ink, mixed 60% of the way towards ground.`;
    case "mark":
      return `the dark blue of ${state.pal1}, its tenth color, between the blue anchor and the darkest.`;
    case "on-mark":
      return `the step of those ramps that contrasts most with mark.`;
    case "paper-dark":
      return `the darkest color in ${state.pal1}.`;
    case "on-paper-dark":
      return `the step that contrasts most with paper-dark.`;
    case "paper-red":
      return `the red anchor of ${state.pal1}, its fifth color.`;
    case "on-paper-red":
      return `the step that contrasts most with paper-red.`;
    case "paper-yellow":
      return `the yellow anchor of ${state.pal1}, its third color.`;
    case "on-paper-yellow":
      return `the step that contrasts most with paper-yellow.`;
    case "paper-green":
      return `the green anchor of ${state.pal1}, its seventh color.`;
    case "on-paper-green":
      return `the step that contrasts most with paper-green.`;
    case "small":
      return `the smallest size.`;
    case "body":
      return `the size closest to 18px.`;
    case "subhead":
      return `the next size up from body.`;
    case "heading":
      return `the next size up from subhead.`;
    case "title":
      return `the largest size.`;
    case "row":
      return `the size closest to 28px; every line, ruling, padding and gap is a multiple of it.`;
  }
  return "";
}

// ─── Hero: pills ─────────────────────────────────────────────────────
const claim = document.getElementById("claim");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// A small glyph in front of each function in the sentence, drawn in the
// text color on a 16-unit grid: what the selector looks for.
const FN_ICONS = {
  lightest: '<circle cx="8" cy="8" r="5.5" />',
  darkest: '<circle cx="8" cy="8" r="5.5" class="fill" />',
  mostVivid: '<circle cx="8" cy="8" r="3" class="fill" /><path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15M3 3l1.8 1.8M11.2 11.2 13 13M13 3l-1.8 1.8M4.8 11.2 3 13" />',
  leastVivid: '<circle cx="8" cy="8" r="5.5" stroke-dasharray="1.6 1.9" />',
  bestContrastWith: '<circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" class="fill" />',
  minContrastWith: '<circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 3.9 9.4L8 8z" class="fill" />',
};

function pillContent(slot, value) {
  const icon = FN_ICONS[value];
  return icon
    ? `<svg class="fn-icon" viewBox="0 0 16 16" aria-hidden="true">${icon}</svg>${value}`
    : value;
}

function cycle(slot, step) {
  if (slot === "fn1") fn1Chosen = true;
  const options = CHOICES[slot];
  const i = options.indexOf(state[slot]);
  state[slot] = options[(i + step + options.length) % options.length];
  const pill = claim.querySelector(`[data-slot="${slot}"]`);
  pill.innerHTML = pillContent(slot, state[slot]);
  if (!reduceMotion.matches) {
    pill.classList.remove("rolled");
    void pill.offsetWidth; // restart the roll
    pill.classList.add("rolled");
  }
  if (slot !== "who") update();
}

claim.querySelectorAll(".pill").forEach((pill) => {
  const slot = pill.dataset.slot;
  if (slot !== "who") pill.title = CHOICES[slot].join(" · ");
  pill.addEventListener("click", (e) => cycle(slot, e.shiftKey ? -1 : 1));
  pill.addEventListener("keydown", (e) => {
    // The readers pill is a span so it can wrap; give it a button's keys.
    if (pill.tagName !== "BUTTON" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); cycle(slot, 1); }
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); cycle(slot, 1); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); cycle(slot, -1); }
  });
});

// ─── Gutters: scales along the page ──────────────────────────────────
// The left gutter is graduated in OKLCH lightness (100 at the top), the
// right one in WCAG contrast (21:1 at the top, on a log scale so 3, 4.5
// and 7 spread out). The marks show where the current book sits on them.

function buildScales() {
  let left = "";
  for (let l = 0; l <= 100; l += 2) {
    const kind = l % 10 === 0 ? "major" : "minor";
    left += `<i class="tick ${kind}" style="top:${100 - l}%"></i>`;
    if (l % 10 === 0) left += `<b class="num" style="top:${100 - l}%">${l}</b>`;
  }
  scaleHtml("rail-left", left, "marks-left");

  let right = "";
  for (let c = 1; c <= 21; c += 1) {
    right += `<i class="tick minor" style="top:${contrastY(c)}%"></i>`;
  }
  for (const c of [1, 1.5, 2, 3, 4.5, 7, 10, 15, 21]) {
    right += `<i class="tick major" style="top:${contrastY(c)}%"></i>`;
    right += `<b class="num" style="top:${contrastY(c)}%">${c}</b>`;
  }
  scaleHtml("rail-right", right, "marks-right");
}

function scaleHtml(railId, ticks, marksId) {
  const scale = document.createElement("div");
  scale.className = "rail-scale";
  scale.innerHTML = `${ticks}<div class="marks" id="${marksId}"></div>`;
  document.getElementById(railId).prepend(scale);
}

/** Position on the contrast gutter, in % from the top: 21:1 at the top. */
function contrastY(c) {
  return 100 - (Math.log(c) / Math.log(21)) * 100;
}

function lightnessOf(hex) {
  return Math.round((oklch(hex)?.l ?? 0) * 1000) / 10;
}

function drawMarks(ground, ink) {
  const pools = state.pal1 === state.pal2 ? [state.pal1] : [state.pal1, state.pal2];
  let left = "";
  for (const pal of pools) {
    for (const key of book.getScope(pal).ownKeys()) {
      const hex = book.resolve(`${pal}.${key}`);
      if (hex === ground || hex === ink) continue; // drawn below, with a needle
      // On the nearest small tick (every 2 points of lightness).
      const onTick = Math.round(lightnessOf(hex) / 2) * 2;
      left += `<i class="mark pool" style="top:${100 - onTick}%;background:${hex}" title="${hex} · L ${lightnessOf(hex)}"></i>`;
    }
  }
  if (ground) left += `<i class="mark ground" style="top:${100 - lightnessOf(ground)}%;--c:${ground}" data-label="ground"></i>`;
  if (ink) left += `<i class="mark ink" style="top:${100 - lightnessOf(ink)}%;--c:${ink}" data-label="ink"></i>`;
  document.getElementById("marks-left").innerHTML = left;

  document.getElementById("marks-right").innerHTML = ground && ink
    ? `<i class="mark ratio" style="top:${contrastY(wcagContrast(ground, ink))}%" data-label="${wcagContrast(ground, ink).toFixed(1)}"></i>`
    : "";
}

// ─── Ledger ──────────────────────────────────────────────────────────
const ledgerBody = document.getElementById("ledger-body");
const paletteBody = document.getElementById("palette-body");
const sizesBody = document.getElementById("sizes-body");
let ledgerRows = new Map(); // full key → <tr>
let ledgerLayout = "";
let lastValues = new Map();

function ledgerKeys() {
  const pals = state.pal1 === state.pal2 ? [state.pal1] : [state.pal1, state.pal2];
  const keys = [];
  for (const pal of pals) {
    for (const key of book.getScope(pal).ownKeys()) keys.push(`${pal}.${key}`);
  }
  for (const key of sizes.ownKeys()) keys.push(`sizes.${key}`);
  for (const key of SHOWN_RULES) keys.push(`ui.${key}`);
  return keys;
}

function buildLedger() {
  const keys = ledgerKeys();
  const layout = keys.join("|");
  if (layout === ledgerLayout) return;
  ledgerLayout = layout;
  ledgerRows = new Map();
  ledgerBody.innerHTML = "";
  paletteBody.innerHTML = "";
  sizesBody.innerHTML = "";
  const counts = { ui: 0, palette: 0, sizes: 0 };

  keys.forEach((key) => {
    const tr = document.createElement("tr");
    const [scope, token] = key.split(".");
    const sheet = scope === "ui" || scope === "sizes" ? scope : "palette";
    const n = ++counts[sheet];
    const members = scope === "ui" ? [] : book.getScope(scope).ownKeys();
    const member = members.indexOf(token);
    tr.className = member < 0 ? "is-rule" : "is-value";
    tr.innerHTML = `
      <td class="no">${n}</td>
      <td class="key"><code>${key}</code></td>
      <td class="rule"></td>
      <td class="val"></td>`;
    if (member >= 0) {
      tr.querySelector(".rule").innerHTML = `<span class="chosen">${
        sheet === "sizes" ? `Curve, step ${member + 1} of ${members.length}`
        : `${{ poline: "Poline", hand: "By hand", ramp: "RampenSau" }[source]}, color ${member + 1} of ${members.length}`}</span>`;
    }
    const body = ({ ui: ledgerBody, sizes: sizesBody, palette: paletteBody })[sheet];
    if (sheet === "ui" && RULE_GROUPS[token]) {
      const heading = document.createElement("tr");
      heading.className = "group";
      heading.innerHTML = `<th colspan="4" scope="colgroup">${RULE_GROUPS[token]}</th>`;
      body.append(heading);
    }
    body.append(tr);
    // Close a section of the Rules table with a note on what it leaves out.
    if (sheet === "ui") {
      const group = Object.values(RULE_TABLE).find((g) => g.show.at(-1) === token);
      if (group?.more) {
        const note = document.createElement("tr");
        note.className = "more";
        const hidden = UI_KEYS.filter((k) => !SHOWN_RULES.includes(k) && group === RULE_TABLE[groupOf(k)]).length;
        note.innerHTML = `<td></td><td colspan="3"><span class="chosen">+ ${hidden} more: ${group.more}.</span></td>`;
        body.append(note);
      }
    }
    ledgerRows.set(key, tr);
  });
}

function fillLedger() {
  const next = new Map();
  for (const [key, tr] of ledgerRows) {
    const { value, error } = read(key);
    next.set(key, value ?? error);
    if (tr.classList.contains("is-rule")) {
      tr.querySelector(".rule").innerHTML = `<code>${highlight(ruleSource(key.slice(3)))}</code>`;
    }
    const isSize = /^-?[\d.]+px$/.test(value ?? "");
    tr.querySelector(".val").innerHTML = !value
      ? `<span class="err" title="${escape(error)}">no ${isSize ? "size" : "color"} qualifies</span>`
      : isSize
        ? `<span class="size-bar" style="width:${value}"></span><code>${value}</code>`
        : `<span class="swatch" style="background:${value}"></span><code>${value}</code>`;
    if (lastValues.size && lastValues.get(key) !== next.get(key) && !reduceMotion.matches) {
      tr.classList.add("changed");
      clearTimeout(tr.flash);
      tr.flash = setTimeout(() => tr.classList.remove("changed"), 180);
    }
  }
  lastValues = next;
}

// ─── Poline picker ───────────────────────────────────────────────────
// The picker draws the palette the sentence's first rule reads. Dragging
// either end refills that scope; the book does the rest.
const picker = document.getElementById("poline-picker");
let pickerPalette = "";

// The picker is restyled to match the page: no color wheel, only its
// outline, and every color on the line drawn as a flat, hard-edged dot of
// that color. The picker's shadow root is open, so a sheet is added to it.
const pickerSheet = new CSSStyleSheet();
pickerSheet.replaceSync(`
  .picker::before { display: none; }
  .picker::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: 50%;
    border: 1px solid var(--poline-picker-line-color);
    pointer-events: none;
  }
  .wheel__line { stroke-dasharray: 1 1; }
  .wheel__point { r: 2.6px; stroke: none; }
  .wheel__anchor { r: 4.2px; stroke: none; }
  .wheel__saturation-ring { display: none; }
  .wheel__outlines circle {
    fill: none;
    stroke: var(--poline-picker-line-color);
    pointer-events: none;
  }
`);
picker.shadowRoot.adoptedStyleSheets = [...picker.shadowRoot.adoptedStyleSheets, pickerSheet];

// The picker paints its end points in its background color; give them
// their own color instead (an inline style wins over its stylesheet).
// Every dot also gets a 1px outline, 1px away from it, drawn in a group of
// our own so the picker's redraws never touch it.
const SVG_NS = "http://www.w3.org/2000/svg";
function paintSpots() {
  const root = picker.shadowRoot;
  const svg = root.querySelector("svg");
  const wheel = root.querySelector(".wheel");
  if (!svg || !wheel) return;
  for (const anchor of root.querySelectorAll(".wheel__anchor")) {
    anchor.style.fill = anchor.getAttribute("fill");
  }

  let outlines = wheel.querySelector(".wheel__outlines");
  if (!outlines) {
    outlines = document.createElementNS(SVG_NS, "g");
    outlines.setAttribute("class", "wheel__outlines");
    wheel.append(outlines);
  }
  const px = 100 / (svg.clientWidth || 300); // one CSS pixel in wheel units
  // The line's first and last colors sit on (or right by) its ends:
  // a color hidden under an end gets no outline of its own.
  const anchors = [...root.querySelectorAll(".wheel__anchor")];
  const near = (a, b) => Math.hypot(a.getAttribute("cx") - b.getAttribute("cx"), a.getAttribute("cy") - b.getAttribute("cy")) < 4.5;
  const dots = [
    ...anchors,
    ...[...root.querySelectorAll(".wheel__point")].filter((p) => !anchors.some((a) => near(a, p))),
  ];
  while (outlines.children.length > dots.length) outlines.lastElementChild.remove();
  dots.forEach((dot, i) => {
    const ring = outlines.children[i] ?? outlines.appendChild(document.createElementNS(SVG_NS, "circle"));
    const r = parseFloat(getComputedStyle(dot).r) || Number(dot.getAttribute("r"));
    ring.setAttribute("cx", dot.getAttribute("cx"));
    ring.setAttribute("cy", dot.getAttribute("cy"));
    ring.setAttribute("r", String(r + px * 1.5)); // 1px gap, then a 1px line
    ring.setAttribute("stroke-width", String(px));
  });
}

function syncPicker() {
  if (pickerPalette === state.pal1) return;
  pickerPalette = state.pal1;
  picker.setPoline(POLINES[pickerPalette]);
  renderSource();
  paintSpots();
}

// The points cannot be moved one by one: dragging anywhere on the wheel
// turns the whole line round its centre (every hue shifts together), so
// the palette keeps its shape and only changes color.
function turnPalette(degrees) {
  POLINES[pickerPalette].shiftHue(degrees);
  picker.updateSVG();
  paintSpots();
  fillPalette(pickerPalette);
  update();
}

function angleAt(event) {
  const box = picker.getBoundingClientRect();
  return Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180 / Math.PI;
}

picker.addEventListener("pointerdown", (event) => {
  picker.setPointerCapture(event.pointerId);
  let last = angleAt(event);
  const move = (e) => {
    const now = angleAt(e);
    const delta = ((now - last + 540) % 360) - 180;
    last = now;
    if (delta) turnPalette(delta);
  };
  const up = () => {
    picker.removeEventListener("pointermove", move);
    picker.removeEventListener("pointerup", up);
  };
  picker.addEventListener("pointermove", move);
  picker.addEventListener("pointerup", up);
});

picker.addEventListener("keydown", (event) => {
  const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[event.key];
  if (!step) return;
  event.preventDefault();
  turnPalette(step);
});

picker.addEventListener("poline-change", () => {
  paintSpots();
  fillPalette(pickerPalette);
  update();
});

// ─── Curve editor ─────────────────────────────────────────────────────
// A square from (0, 0) to (100, 100), y pointing up: the x axis is the
// step, the y axis how far it is from the smallest size to the largest.
const curveSvg = document.getElementById("curve");
const curveEl = {
  path: document.getElementById("curve-path"),
  arm1: document.getElementById("arm-1"),
  arm2: document.getElementById("arm-2"),
  h1: document.getElementById("handle-1"),
  h2: document.getElementById("handle-2"),
  steps: document.getElementById("curve-steps"),
};
const toSvg = (x, y) => [x * 100, 100 - y * 100];

function drawCurve() {
  const [ax, ay] = toSvg(curve.x1, curve.y1);
  const [bx, by] = toSvg(curve.x2, curve.y2);
  curveEl.path.setAttribute("d", `M0 100 C${ax} ${ay} ${bx} ${by} 100 0`);
  curveEl.arm1.setAttribute("x1", 0); curveEl.arm1.setAttribute("y1", 100);
  curveEl.arm1.setAttribute("x2", ax); curveEl.arm1.setAttribute("y2", ay);
  curveEl.arm2.setAttribute("x1", 100); curveEl.arm2.setAttribute("y1", 0);
  curveEl.arm2.setAttribute("x2", bx); curveEl.arm2.setAttribute("y2", by);
  curveEl.h1.setAttribute("cx", ax); curveEl.h1.setAttribute("cy", ay);
  curveEl.h2.setAttribute("cx", bx); curveEl.h2.setAttribute("cy", by);
  const [min, max] = SIZE_RANGE;
  curveEl.steps.innerHTML = sizeValues().map((v, i) => {
    const [x, y] = toSvg(i / (SIZE_STEPS - 1), (v - min) / (max - min));
    return `<line class="curve-tick" x1="${x}" y1="${y}" x2="100" y2="${y}" />` +
      `<circle class="curve-step" cx="${x}" cy="${y}" r="1.6" />` +
      `<text class="curve-label" x="103" y="${y + 1.2}">${v}</text>`;
  }).join("");
  document.getElementById("size-min").textContent = `${min}px`;
  document.getElementById("size-max").textContent = `${max}px`;
}

function moveHandle(which, clientX, clientY) {
  const pt = new DOMPoint(clientX, clientY).matrixTransform(curveSvg.getScreenCTM().inverse());
  const x = Math.min(1, Math.max(0, pt.x / 100));
  const y = Math.min(1, Math.max(0, (100 - pt.y) / 100));
  curve[`x${which}`] = x;
  curve[`y${which}`] = y;
  fillSizes();
  drawCurve();
  update();
}

for (const which of [1, 2]) {
  const handle = curveEl[`h${which}`];
  handle.addEventListener("pointerdown", (event) => {
    handle.setPointerCapture(event.pointerId);
    const move = (e) => moveHandle(which, e.clientX, e.clientY);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
  handle.addEventListener("keydown", (event) => {
    const step = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[event.key];
    if (!step) return;
    event.preventDefault();
    curve[`x${which}`] = Math.min(1, Math.max(0, curve[`x${which}`] + step[0]));
    curve[`y${which}`] = Math.min(1, Math.max(0, curve[`y${which}`] + step[1]));
    fillSizes();
    drawCurve();
    update();
  });
}
drawCurve();

// ─── Graph ───────────────────────────────────────────────────────────
// The book's own SVG renderer, drawn on its own paper. Its colors and font
// come from CSS custom properties, set on that paper (see .sheet-graph).
// It is drawn even while the paper is behind, so the paper has its real
// length in the folder; redraws wait for a pause, like the sizes.
const graph = document.getElementById("graph");
let graphTimer = 0;
function renderGraph() {
  clearTimeout(graphTimer);
  graphTimer = setTimeout(() => {
    try {
      graph.innerHTML = book.render("svg", { interactive: true });
      const svg = graph.querySelector("svg");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
    } catch (error) {
      graph.textContent = error.message;
    }
  }, 200);
}

// ─── Palette source: Poline, by hand, or RampenSau ───────────────────
const HINTS = {
  poline: (name) => `Turn the wheel to rotate <b>${name}</b>.`,
  hand: (name) => `Select a swatch to pick another color for <b>${name}</b>.`,
  ramp: (name) => `Move the start hue to generate <b>${name}</b> again.`,
};
const sourcePill = document.getElementById("source-pill");
const handSwatches = document.getElementById("hand-swatches");
const rampStrip = document.getElementById("ramp-strip");
const rampHue = document.getElementById("ramp-hue");

/** Show the view and controls of the current source for the palette the
 *  sentence's first rule reads. */
function renderSource() {
  const name = pickerPalette || state.pal1;
  for (const view of document.querySelectorAll(".source-view")) view.hidden = view.dataset.view !== source;
  for (const button of document.querySelectorAll(".source-switch button")) {
    button.setAttribute("aria-pressed", String(button.dataset.source === source));
  }
  sourcePill.textContent = SOURCE_WORDS[source];
  document.getElementById("source-hint").innerHTML = HINTS[source](name);
  if (source === "hand") {
    // Each swatch is the site's own picker (hdr-color-input), so it opens
    // the same black-paper panel as the docs, not the system dialog.
    handSwatches.innerHTML = HAND[name].map((hex, i) =>
      `<color-input class="hand-swatch" value="${hex}" initial-colorspace="hsl" no-alpha ` +
      `data-index="${i}" title="${name} color ${i + 1}: ${hex}" aria-label="${name} color ${i + 1}"></color-input>`).join("");
  }
  if (source === "ramp") {
    rampHue.value = RAMP_START[name];
    rampStrip.innerHTML = rampHexes(name).map((hex) => `<i style="background:${hex}" title="${hex}"></i>`).join("");
  }
  if (source === "poline") paintSpots();
}

function setSource(next) {
  source = next;
  for (const name of Object.keys(SEEDS)) fillPalette(name);
  ledgerLayout = ""; // the Source column names the new source
  renderSource();
  update();
}

sourcePill.addEventListener("click", () => setSource(SOURCES[(SOURCES.indexOf(source) + 1) % SOURCES.length]));
for (const button of document.querySelectorAll(".source-switch button")) {
  button.addEventListener("click", () => setSource(button.dataset.source));
}

function onHandPick(event) {
  const input = event.target.closest?.("color-input.hand-swatch");
  const color = input && parse(input.value);
  if (!color) return;
  const hex = formatHex(color);
  const name = pickerPalette;
  const index = Number(input.dataset.index);
  if (HAND[name][index] === hex) return;
  HAND[name][index] = hex;
  input.title = `${name} color ${index + 1}: ${hex}`;
  fillPalette(name);
  update();
}
handSwatches.addEventListener("input", onHandPick);
handSwatches.addEventListener("change", onHandPick);

rampHue.addEventListener("input", () => {
  RAMP_START[pickerPalette] = Number(rampHue.value);
  fillPalette(pickerPalette);
  rampStrip.innerHTML = rampHexes(pickerPalette).map((hex) => `<i style="background:${hex}" title="${hex}"></i>`).join("");
  update();
});

// ─── Folder: two papers, one in front ─────────────────────────────────
const folder = document.getElementById("folder");
function bringToFront(name) {
  for (const sheet of folder.querySelectorAll(".folder-sheet")) {
    const front = sheet.dataset.sheet === name;
    sheet.classList.toggle("is-front", front);
    sheet.querySelector(".folder-tab").setAttribute("aria-pressed", String(front));
    sheet.querySelector(".folder-body").inert = !front;
  }
}
folder.addEventListener("click", (event) => {
  // Its tab, or any part of a paper behind that shows, brings it forward.
  const sheet = event.target.closest(".folder-tab")?.closest(".folder-sheet")
    ?? event.target.closest(".folder-sheet:not(.is-front)");
  if (!sheet) return;
  bringToFront(sheet.dataset.sheet);
  if (sheet.dataset.sheet === "graph") renderGraph();
});
bringToFront("rules");

// ─── Readings ────────────────────────────────────────────────────────
function fillReadings(values) {
  document.getElementById("read-designer").innerHTML = UI_KEYS.map((key) => {
    const v = values[key];
    const chip = !v ? "" : SIZE_KEYS.includes(key)
      ? `<code class="size-note">${v}</code>`
      : `<i class="chip" style="background:${v}"></i>`;
    return `<li><strong>${key}</strong> is ${ruleWords(key)} ${chip}</li>`;
  }).join("");

  let css;
  try {
    css = book.render("css-variables", { scopes: ["ui"] });
  } catch (error) {
    css = `/* ${error.message} */`;
  }
  document.getElementById("read-dev").innerHTML = highlight(css.trim(), { lang: "css" });

  document.getElementById("read-llm").innerHTML = highlight(UI_KEYS
    .map((key) => `ui.set('${key}',\n  ${ruleSource(key)});`)
    .join("\n"));
}

// ─── Update ──────────────────────────────────────────────────────────
const page = document.documentElement;

// The page's own type sizes follow the size rules, but only once the
// curve has been still for a moment: re-flowing the whole page on every
// pointer move makes it jump under the cursor.
let sizeTimer = 0;
let sizesApplied = false;
function applySizes(values) {
  const apply = () => {
    for (const key of SIZE_KEYS) {
      const prop = key === "row" ? "--row" : `--size-${key}`;
      if (values[key]) page.style.setProperty(prop, values[key]);
    }
    sizesApplied = true;
  };
  clearTimeout(sizeTimer);
  if (!sizesApplied) apply(); // the first paint does not wait
  else sizeTimer = setTimeout(apply, 400);
}

function update() {
  try {
    writeRules();
  } catch {
    // A rule the book refuses keeps the last paint; the ledger shows why.
  }

  const values = {};
  for (const key of UI_KEYS) {
    const { value } = read(`ui.${key}`);
    if (value) values[key] = value;
  }

  // The page is painted with the book it describes. A rule that finds
  // nothing keeps the last paint, and the ledger says why.
  // Trying it the other way round: the page in the mark's blue, and what
  // the mark used to paint (rails, highlights, footer) in the page's paper.
  const INVERTED = true;
  const surface = INVERTED ? values.mark : values.ground;
  const surfaceInk = INVERTED ? values["on-mark"] : values.ink;
  const mark = INVERTED ? values.ground : values.mark;
  const markInk = INVERTED ? values.ink : values["on-mark"];
  if (surface) page.style.setProperty("--ground", surface);
  if (surfaceInk) page.style.setProperty("--ink", surfaceInk);
  page.style.setProperty("--accent", values.accent ?? values.ink ?? "currentColor");
  page.style.setProperty("--rule", values.rule ?? "currentColor");
  page.style.setProperty("--highlight", mark ?? "currentColor");
  page.style.setProperty("--on-highlight", markInk ?? "Canvas");
  applySizes(values);
  for (const key of ["paper-dark", "on-paper-dark", "paper-red", "on-paper-red", "paper-yellow", "on-paper-yellow", "paper-green", "on-paper-green"]) {
    if (values[key]) page.style.setProperty(`--${key}`, values[key]);
  }

  for (const key of ["ground", "ink"]) {
    const out = claim.querySelector(`[data-out="${key}"]`);
    // The value's '#' is drawn in the color itself; the digits follow.
    out.querySelector(".hex").textContent = values[key]?.replace(/^#/, "") ?? "nothing";
    out.querySelector(".hash").style.color = values[key] ?? "";
    out.classList.toggle("missing", !values[key]);
  }

  drawMarks(values.ground, values.ink);
  syncPicker();
  buildLedger();
  fillLedger();
  fillReadings(values);
  renderGraph();
}

// The start sample is written as plain text in the page and highlighted
// here, like every other piece of code on it.
const startCode = document.querySelector(".start-code");
startCode.innerHTML = highlight(startCode.textContent);

// ─── Cut sheets ──────────────────────────────────────────────────────
// The long sheets are torn off like a receipt; select one to unroll it,
// and select its header to tear it off again.
for (const sheet of document.querySelectorAll(".sheet.is-cut")) {
  const toggle = (open) => {
    sheet.classList.toggle("is-open", open);
    sheet.setAttribute("aria-expanded", String(open));
  };
  sheet.addEventListener("click", (event) => {
    const open = sheet.classList.contains("is-open");
    if (!open) toggle(true);
    else if (event.target.closest("header")) toggle(false);
  });
  sheet.addEventListener("keydown", (event) => {
    if (event.target !== sheet || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggle(!sheet.classList.contains("is-open"));
  });
}

// Draw the icons on the pills as written in the page.
for (const slot of ["fn1", "fn2"]) {
  claim.querySelector(`[data-slot="${slot}"]`).innerHTML = pillContent(slot, state[slot]);
}

// ─── Small things ────────────────────────────────────────────────────
function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = "Copied";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1400);
    } catch {
      /* clipboard refused; the command is still selectable */
    }
  });
});



buildScales();
darkScheme.addEventListener("change", () => {
  if (fn1Chosen) return;
  state.fn1 = darkScheme.matches ? "darkest" : "lightest";
  claim.querySelector('[data-slot="fn1"]').innerHTML = pillContent("fn1", state.fn1);
  update();
});

update();
