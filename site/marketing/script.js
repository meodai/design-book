// ════════════════════════════════════════════════════════════════════
// Design Book — Marketing page
// ════════════════════════════════════════════════════════════════════

import {
  parse,
  formatHex,
  converter,
  wcagContrast,
  differenceEuclidean,
} from "https://esm.sh/culori@4?bundle";

import "hdr-color-input";

// Default every <color-input> on the page (declarative + dynamically created)
// to hex: the field shows the value in the picker's color space, and the
// hex field (shared.css) is sized for a hex.
{
  const applyHsl = (el) => {
    if (el.hasAttribute("initial-colorspace")) return;
    el.setAttribute("initial-colorspace", "hex");
  };
  document.querySelectorAll("color-input").forEach(applyHsl);
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "COLOR-INPUT") applyHsl(node);
        node.querySelectorAll?.("color-input").forEach(applyHsl);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

import {
  DesignBook,
  SVGRenderer,
  color,
  ref,
  px,
  ramp,
  relativeTo,
  createFunctionToken,
  colorMix,
  lighten,
  darken,
  scaleNames,
  bestContrastWith,
  minContrastWith,
  closest,
  furthestFrom,
  mostVivid,
  leastVivid,
  lightest,
  darkest,
  nextLarger,
  nextSmaller,
  random,
  nth,
  sibling,
  inherited,
  source,
} from "../../src/index";

import { Poline } from "poline";

import { buildBook, applyRampToValues } from "./demo-book.js";

const toOklab = converter("oklab");
const toOklch = converter("oklch");

const hex = (c) => formatHex(c);
const lab = (c) => toOklab(parse(c));
const lch = (c) => toOklch(parse(c));

function deltaE(a, b) {
  const A = lab(a), B = lab(b);
  return Math.hypot(A.l - B.l, A.a - B.a, A.b - B.b);
}
function contrast(a, b) { return wcagContrast(a, b); }

// ── Footer year ────────────────────────────────────────────────────
{
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
}

// ── Demos run the real library ─────────────────────────────────────
// Each plate builds a throwaway book with the palette in a scope, sets one
// token that calls the selector, and reads back what the library resolved.
// So what you see is what `design-book` does, not a re-implementation.

/** Put `values` into scope `pool` as p0, p1, … and resolve `make(pool)`.
 *  `make` returns the function token; returns null if the selector throws
 *  (an empty pool, nothing readable, …). */
function pick (values, make, toToken = color) {
  const b = new DesignBook("demo");
  const pool = b.addScope("pool");
  values.forEach((v, i) => pool.set(`p${i}`, toToken(v)));
  const out = b.addScope("out");
  try {
    out.set("pick", make(pool));
    return b.resolve("out.pick");
  } catch {
    return null;
  }
}

/** Index of `hex` in `values`, comparing as colors. */
function indexOfColor (values, hex) {
  if (!hex) return -1;
  const want = formatHex(parse(hex));
  return values.findIndex((v) => formatHex(parse(v)) === want);
}

// ── Shared palettes for plates ─────────────────────────────────────
const PALETTE_BRAND = [
  "#0d0a03", "#de5331", "#dab43d", "#479549", "#3c61a0", "#eee9dc",
];
const PALETTE_CONTRAST_SURFACES = [
  "#0d0a03", "#eee9dc", "#de5331", "#3c61a0", "#479549", "#dab43d",
];

// ══════════════════════════════════════════════════════════════════════
//  HERO ILLUSTRATION — selector ring
// ══════════════════════════════════════════════════════════════════════
(function heroIllustration () {
  const root     = document.getElementById("hero-illustration");
  const ringEl   = document.getElementById("hi-ring");
  const fnSel    = document.getElementById("hi-fn");
  const centerEl = document.getElementById("hi-center");
  if (!root || !ringEl || !fnSel || !centerEl) return;

  const PALETTE = [
    "#de5331", "#dab43d", "#479549", "#3c61a0", "#eee9dc", "#0d0a03",
  ];
  const INITIAL_CENTER = centerEl.getAttribute("value") || "#0d0a03";
  centerEl.value = INITIAL_CENTER;
  let CENTER = INITIAL_CENTER;
  const RADIUS = 150;
  const N = PALETTE.length;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const positions = PALETTE.map((_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * RADIUS, y: Math.sin(a) * RADIUS };
  });

  const curve = document.createElementNS(SVG_NS, "path");
  curve.setAttribute("class", "hi-curve");
  ringEl.appendChild(curve);

  const dots = PALETTE.map((c, i) => {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "hi-dot");
    dot.setAttribute("cx", positions[i].x);
    dot.setAttribute("cy", positions[i].y);
    dot.setAttribute("r", 11);
    dot.setAttribute("fill", c);
    ringEl.appendChild(dot);
    return dot;
  });

  // Every option runs the real selector over the ring. The vivid/lightness
  // ones ignore the centre — they rank the ring itself.
  const selectors = {
    bestContrastWith: (s) => bestContrastWith(color(CENTER), s),
    minContrastWith:  (s) => minContrastWith(color(CENTER), s, { minContrast: 3 }),
    closest:     (s) => closest(color(CENTER), s),
    furthestFrom:     (s) => furthestFrom(color(CENTER), s),
    mostVivid:        (s) => mostVivid(s),
    leastVivid:       (s) => leastVivid(s),
    lightest:         (s) => lightest(s),
    darkest:          (s) => darkest(s),
  };

  function update () {
    const fn = selectors[fnSel.value] || selectors.bestContrastWith;
    const winnerIdx = indexOfColor(PALETTE, pick(PALETTE, fn));

    dots.forEach((d, i) => {
      d.classList.toggle("is-winner", i === winnerIdx);
      d.setAttribute("r", i === winnerIdx ? 14 : 11);
    });

    const p = positions[winnerIdx];
    curve.setAttribute("d", p ? `M 0 0 L ${p.x} ${p.y}` : "");
  }

  function onCenterChange () {
    const v = centerEl.value;
    if (!v) return;
    CENTER = v;
    update();
  }

  fnSel.addEventListener("change", update);
  centerEl.addEventListener("change", onCenterChange);
  centerEl.addEventListener("input", onCenterChange);
  update();
})();

// ══════════════════════════════════════════════════════════════════════
//  THE LIVE GRAPH — hero visual
// ══════════════════════════════════════════════════════════════════════
const book = buildBook();
let activeRamp = null;   // poline-generated ramp scope (populated below)

// Custom renderer — must register before the first paintRenderers() call.
// Routes each resolved value into the right Tailwind theme section by type.
function tailwindRenderer (b) {
  const ui     = b.getScope("ui");
  const values = b.getScope("values");
  const colors  = {};
  const spacing = {};

  const isColor     = (s) => parse(s) != null;
  const isDimension = (s) => /^-?\d+(\.\d+)?[a-z%]+$/i.test(s);

  function route (key, value) {
    if (isColor(value))     colors[key]  = value;
    else if (isDimension(value)) spacing[key] = value;
  }

  for (const k of values.getAllKeys()) route(k, values.resolve(k));
  for (const k of ui.getAllKeys()) {
    try { route(`ui-${k}`, ui.resolve(k)); }
    catch { /* skip unresolvable */ }
  }

  const sections = [];
  if (Object.keys(colors).length) {
    sections.push(`colors: ${JSON.stringify(colors, null, 8).replace(/\n/g, "\n      ")}`);
  }
  if (Object.keys(spacing).length) {
    sections.push(`spacing: ${JSON.stringify(spacing, null, 8).replace(/\n/g, "\n      ")}`);
  }

  return `module.exports = {
  theme: {
    extend: {
      ${sections.join(",\n      ")}
    }
  }
};`;
}
book.registerRenderer("tailwind", tailwindRenderer);

(function graphSection () {
  const viz     = document.getElementById("graph-viz");
  const brandIn = document.getElementById("graph-brand");
  const invert  = document.getElementById("graph-invert");
  if (!viz) return;

  // <color-input> sets its .value asynchronously after upgrade — seed
  // the property from the attribute so reads work on first paint.
  const INITIAL_BRAND = brandIn.getAttribute("value") || "#de5331";
  brandIn.value = INITIAL_BRAND;

  let flipped = false;

  function paint () {
    const renderer = new SVGRenderer(book, {
      gap: 36,
      padding: 30,
      fontSize: 13,
      dotSize: 5,
      strokeWidth: 1.5,
      interactive: true,
      // every dependency, the ramp's and the transforms' too (the
      // renderer shows only refs and selector picks by default)
      linksOnly: false,
    });
    viz.innerHTML = renderer.render();
    keepRampAnchor();
    paintCard();
    // Renderers also feed the next section
    paintRenderers();
  }

  // The ramp is built round the brand color, so of its edges from
  // brand.primary only the one to the step nearest that color (in OKLab)
  // is drawn: the step the brand sits on. The others, and their labels,
  // are taken out.
  const oklabDistance = differenceEuclidean("oklab");
  function keepRampAnchor () {
    const seed = book.resolve("brand.primary");
    const edges = [...viz.querySelectorAll('g.connection[data-to="brand.primary"]')]
      .filter((g) => g.dataset.from?.startsWith("values.shade-"));
    if (edges.length < 2) return;
    let anchor = null;
    let nearest = Infinity;
    for (const g of edges) {
      const d = oklabDistance(seed, book.resolve(g.dataset.from));
      if (d < nearest) { nearest = d; anchor = g.dataset.from; }
    }
    viz.querySelectorAll('[data-to="brand.primary"]').forEach((el) => {
      if (el.dataset.from?.startsWith("values.shade-") && el.dataset.from !== anchor) el.remove();
    });
  }

  // The card on the blueprint: the book's ui decisions, applied.
  const card = document.getElementById("graph-card");
  const CARD_TOKENS = {
    "--card-surface": "ui.surface",
    "--card-text": "ui.text",
    "--card-accent": "ui.accent",
    "--card-on-accent": "ui.onAccent",
    "--card-hover": "ui.hover",
    "--card-subtle": "ui.subtle",
    "--card-gap": "ui.gap",
    "--card-breath": "ui.breath",
  };
  function paintCard () {
    if (!card) return;
    for (const [prop, key] of Object.entries(CARD_TOKENS)) {
      try { card.style.setProperty(prop, book.resolve(key)); } catch {}
    }
  }

  function onBrandChange () {
    const v = brandIn.value || INITIAL_BRAND;
    try { book.getScope("brand").set("primary", color(v)); paint(); } catch {}
  }

  brandIn.addEventListener("change", onBrandChange);
  brandIn.addEventListener("input", onBrandChange);

  invert.addEventListener("click", () => {
    flipped = !flipped;
    applyRampToValues(book, { flipped });
    paint();
  });

  paint();
})();

// ══════════════════════════════════════════════════════════════════════
//  RENDERER COMPARISON
// ══════════════════════════════════════════════════════════════════════
// (tailwindRenderer is defined and registered above, before the first
// paintRenderers() call fires inside the hero IIFE.)

// JSON as a person would write it: arrays of plain values and small
// objects on one line, everything else indented.
function compactJSON (text, width = 110) {
  let value;
  try { value = typeof text === "string" ? JSON.parse(text) : text; }
  catch { return text; }
  const out = (v, indent) => {
    const flat = JSON.stringify(v);
    if (v === null || typeof v !== "object" || flat.length + indent.length <= width) {
      return flat.replace(/([,:])(?=["\d\[{tfn-])/g, "$1 ");
    }
    const next = indent + "  ";
    if (Array.isArray(v)) return `[\n${v.map((x) => next + out(x, next)).join(",\n")}\n${indent}]`;
    return `{\n${Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${out(x, next)}`).join(",\n")}\n${indent}}`;
  };
  return out(value, "");
}

function paintRenderers () {
  const css  = document.getElementById("r-css");
  const json = document.getElementById("r-json");
  const w3   = document.getElementById("r-w3");
  const tw   = document.getElementById("r-tailwind");
  if (!css) return;

  // The renderer is registered once at startup (see below); here we just
  // ask the book for each output by name — built-ins and custom alike.
  try { css.textContent  = book.render("css-variables"); }
  catch (e) { css.textContent = `/* ${e.message} */`; }
  try { json.textContent = book.render("json"); }
  catch (e) { json.textContent = `// ${e.message}`; }
  try { w3.textContent   = compactJSON(book.render("w3-design-tokens")); }
  catch (e) { w3.textContent  = `// ${e.message}`; }
  try { tw.textContent   = book.render("tailwind"); }
  catch (e) { tw.textContent  = `// ${e.message}`; }
}


// ══════════════════════════════════════════════════════════════════════
//  EXTEND — custom function + poline integration
// ══════════════════════════════════════════════════════════════════════
(function extendCustomFn () {
  // The `warmest` selector from the code sample, registered on a copy of
  // the demo book and called through a real function token.
  const ext = buildBook();
  ext.registerFunction("warmest", (scope) => {
    let best = null, bestScore = -Infinity;
    for (const key of scope.getAllKeys()) {
      const v = scope.resolve(key);
      const { c = 0, h = 0 } = lch(v) ?? {};
      const score = c * Math.cos(((h - 50) * Math.PI) / 180);
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return best;
  });
  ext.getScope("ui").set("warm", createFunctionToken("warmest", [ext.getScope("values")]));
  const winner = ext.resolve("ui.warm");

  document.getElementById("extend-fn-swatch").style.background = winner;
  document.getElementById("extend-fn-hex").textContent = winner;
})();

(function extendPoline () {
  const strip = document.getElementById("extend-poline-strip");
  const swatchOut = document.getElementById("extend-poline-swatch");
  const hexOut = document.getElementById("extend-poline-hex");
  if (!strip) return;

  let cssColors = [];
  try {
    // Build a Poline ramp from ink → vermilion → paper and snap a token to it.
    // Poline's anchorColors use HSL triples [h, s, l] in 0..360 / 0..100 / 0..100.
    // Poline anchor format: [hueDeg, saturation 0-1, lightness 0-1].
    const poline = new Poline({
      anchorColors: [
        [20, 0.30, 0.08],   // near-black warm
        [12, 0.85, 0.45],   // vermilion
        [42, 0.40, 0.92],   // paper
      ],
      numPoints: 7,
    });
    cssColors = poline.colorsCSS;
  } catch (e) {
    strip.innerHTML = `<span style="background:#de5331;grid-column:1/-1">poline error: ${e.message}</span>`;
    return;
  }

  strip.innerHTML = cssColors
    .map((c) => `<span style="background:${c}"></span>`)
    .join("");

  // Convert poline css colors (hsl strings) to hex and let the library pick.
  const hexes = cssColors.map((c) => hex(parse(c))).filter(Boolean);
  const surface = book.getScope("ui").resolve("surface");
  const border = pick(hexes, (s) => minContrastWith(color(surface), s, { minContrast: 3 }));
  if (border) {
    swatchOut.style.background = border;
    hexOut.textContent = border;
  } else if (hexes.length) {
    // Fallback: show the first member so the demo doesn't read as broken.
    swatchOut.style.background = hexes[0];
    hexOut.textContent = hexes[0];
  }
})();

// ══════════════════════════════════════════════════════════════════════
//  Existing function plate demos (unchanged behaviour)
// ══════════════════════════════════════════════════════════════════════

// — bestContrastWith: two inks you pick, the one that reads best per surface —
(function demoContrast () {
  const row = document.getElementById("demo-contrast");
  const inA = document.getElementById("contrast-ink-a");
  const inB = document.getElementById("contrast-ink-b");
  if (!row || !inA || !inB) return;
  for (const input of [inA, inB]) input.value = input.getAttribute("value");

  const wcagBadge = (ratio) => {
    if (ratio >= 7)   return { label: "AAA",  cls: "is-aaa"  };
    if (ratio >= 4.5) return { label: "AA",   cls: "is-aa"   };
    if (ratio >= 3)   return { label: "AA·LG", cls: "is-aalg" };
    return                  { label: "fails", cls: "is-fail" };
  };
  function paint () {
    const inks = { a: inA.value || inA.getAttribute("value"), b: inB.value || inB.getAttribute("value") };
    if (!parse(inks.a) || !parse(inks.b)) return; // mid-typing: keep the last result
    row.innerHTML = PALETTE_CONTRAST_SURFACES.map((surface) => {
      const text = pick(Object.values(inks), (s) => bestContrastWith(color(surface), s));
      const name = text.toLowerCase() === String(inks.a).toLowerCase() ? "a" : "b";
      const ratio = contrast(surface, text);
      const badge = wcagBadge(ratio);
      return `
        <div class="contrast-tile" style="background:${surface};color:${text}">
          <span class="ctop">surface ${surface}</span>
          <span class="cbig">Aa</span>
          <span class="cbadge ${badge.cls}">${badge.label}</span>
          <span class="cbottom">ink.${name} · ${ratio.toFixed(1)}:1</span>
        </div>`;
    }).join("");
  }
  for (const input of [inA, inB]) {
    input.addEventListener("input", paint);
    input.addEventListener("change", paint);
  }
  paint();
})();

// — closest: a free value on a slider, snapped to the scale's nearest step —
(function demoClosest () {
  const rulerEl = document.getElementById("closest-ruler");
  const readoutEl = document.getElementById("closest-readout");
  const slider = document.getElementById("closest-value");
  if (!rulerEl || !readoutEl || !slider) return;

  const STEPS = { xs: 4, s: 8, m: 12, l: 16, xl: 24, "2xl": 32, "3xl": 48 };
  const book = new DesignBook("closest-demo");
  const space = book.addScope("space");
  for (const [key, n] of Object.entries(STEPS)) space.set(key, px(n));
  const ui = book.addScope("ui");
  ui.set("raw", px(Number(slider.value)));
  ui.set("gap", closest(ref("ui.raw"), ref("space")));

  const min = Number(slider.min);
  const max = Number(slider.max);
  // where the slider puts its handle for a value: the same place on the ruler
  const THUMB = 13;
  const at = (v) => THUMB / 2 + ((v - min) / (max - min)) * (rulerEl.clientWidth - THUMB);

  function paint () {
    const v = Number(slider.value);
    ui.set("raw", px(v));
    const gap = book.resolve("ui.gap");
    const key = Object.keys(STEPS).find((k) => `${STEPS[k]}px` === gap);
    rulerEl.innerHTML =
      Object.entries(STEPS).map(([k, n]) => `
        <span class="cr-mark${k === key ? " is-pick" : ""}" style="left:${at(n)}px"><b>${k}</b><i>${n}</i></span>`).join("") +
      `<span class="cr-free" style="left:${at(v)}px"></span>`;
    readoutEl.innerHTML = `<b>${v}px</b> → <span class="c-fn">closest</span> → <b>space.${key}</b> · ${gap}`;
  }
  slider.addEventListener("input", paint);
  new ResizeObserver(paint).observe(rulerEl);
  paint();
})();

// — closest, colors: our palette with a shade above and under each color,
//   and a picked color landing on the nearest of them —
(function demoClosestColor () {
  const gridEl = document.getElementById("closest-swatches");
  const readoutEl = document.getElementById("closest-color-readout");
  const picker = document.getElementById("closest-color");
  if (!gridEl || !readoutEl || !picker) return;
  picker.value = picker.getAttribute("value");

  const BASE = { red: "#de5331", yellow: "#dab43d", green: "#479549", blue: "#3c61a0" };
  const toOk = converter("oklch");
  const shade = (hex, dl) => {
    const c = toOk(hex);
    return formatHex({ ...c, l: Math.min(0.97, Math.max(0.12, c.l + dl)) });
  };
  // rows top to bottom: lighter, the color, darker
  const ROWS = [["light", 0.14], ["", 0], ["dark", -0.14]];
  const book = new DesignBook("closest-colors");
  const palette = book.addScope("palette");
  const cells = [];
  for (const [suffix, dl] of ROWS) {
    for (const [name, hex] of Object.entries(BASE)) {
      const key = suffix ? `${name}-${suffix}` : name;
      const value = dl ? shade(hex, dl) : hex;
      palette.set(key, color(value));
      cells.push({ key, value });
    }
  }
  const ui = book.addScope("ui");
  ui.set("pick", color(picker.value));
  ui.set("accent", closest(ref("ui.pick"), ref("palette")));

  function paint () {
    const value = picker.value || picker.getAttribute("value");
    if (!parse(value)) return;
    ui.set("pick", color(value));
    const accent = book.resolve("ui.accent");
    const key = cells.find((c) => c.value.toLowerCase() === accent.toLowerCase())?.key;
    gridEl.innerHTML = cells.map((c) => `
      <span class="cs-cell${c.key === key ? " is-pick" : ""}" style="background:${c.value}"></span>`).join("");
    readoutEl.innerHTML = `<b>${formatHex(parse(value))}</b> → <span class="c-fn">closest</span> → <b>palette.${key}</b> · ${accent}`;
  }
  picker.addEventListener("input", paint);
  picker.addEventListener("change", paint);
  paint();
})();

// — furthestFrom: the palette laid out by its OKLab distance from a target;
//   the pick is the one at the far end —
(function demoFurthest () {
  const ruler = document.getElementById("ffr-ruler");
  const readout = document.getElementById("ffr-readout");
  const picker = document.getElementById("ffr-target");
  if (!ruler || !readout || !picker) return;
  picker.value = picker.getAttribute("value");

  const NAMES = ["ink", "red", "yellow", "green", "blue", "paper"];
  const book = new DesignBook("furthest-demo");
  const palette = book.addScope("palette");
  PALETTE_BRAND.forEach((c, i) => palette.set(NAMES[i], color(c)));
  const ui = book.addScope("ui");
  ui.set("surface", color(picker.value));
  ui.set("accent", furthestFrom(ref("ui.surface"), ref("palette")));

  const SIZE = 18;
  const PAD = 12;
  const at = (d) => PAD + d * (ruler.clientWidth - 2 * PAD);

  function paint () {
    const target = picker.value || picker.getAttribute("value");
    if (!parse(target)) return;
    ui.set("surface", color(formatHex(parse(target))));
    const pick = book.resolve("ui.accent");

    // nearest first; a swatch that would overlap the one before stacks above it
    const members = NAMES.map((name, i) => ({ name, c: PALETTE_BRAND[i], d: deltaE(target, PALETTE_BRAND[i]) }))
      .sort((x, y) => x.d - y.d);
    const lanes = [];
    for (const m of members) {
      m.x = at(Math.min(1, m.d));
      let lane = 0;
      while (lanes[lane] !== undefined && m.x - lanes[lane] < SIZE + 2) lane++;
      lanes[lane] = m.x;
      m.lane = lane;
    }
    const picked = members.find((m) => m.c.toLowerCase() === pick.toLowerCase());
    ruler.innerHTML =
      [0, 0.25, 0.5, 0.75, 1].map((t) => `<span class="ffr-tick" style="left:${at(t)}px">${t}</span>`).join("") +
      `<span class="ffr-target" style="left:${at(0)}px;background:${target}"></span>` +
      members.map((m) => `<span class="ffr-swatch${m === picked ? " is-pick" : ""}"
        style="left:${m.x}px;bottom:calc(var(--row) + ${m.lane * (SIZE + 4)}px);background:${m.c}" title="palette.${m.name} · ${m.d.toFixed(2)}"></span>`).join("");
    readout.innerHTML = `<span class="c-fn">furthestFrom</span>(target, palette) → <b>palette.${picked.name}</b> · ${picked.d.toFixed(2)} away`;
  }
  picker.addEventListener("input", paint);
  picker.addEventListener("change", paint);
  new ResizeObserver(paint).observe(ruler);
  paint();
})();

// — minContrastWith —
(function demoMin () {
  const surface = "#eee9dc";
  const ramp = ["#eee9dc", "#d5cdb5", "#beb497", "#9c907a", "#766b5b", "#564f44", "#3a342c", "#0d0a03"];
  function paint (id, ratio) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = pick(ramp, (s) => minContrastWith(color(surface), s, { minContrast: ratio }));
    el.style.background = surface;
    const out = el.querySelector(".min-text");
    if (!text) {
      el.classList.add("fail");
      out.style.color = "var(--muted)";
      out.textContent = "no member reaches it";
      return;
    }
    out.style.color = text;
    out.innerHTML =
      `Aa — Body, caption, label.<br>
       <span style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.04em;opacity:.75">${text} · ${contrast(surface, text).toFixed(1)}:1</span>`;
  }
  paint("min-sample-3", 3); paint("min-sample-45", 4.5); paint("min-sample-7", 7);
})();

// — nextLarger / nextSmaller —
(function demoStep () {
  const scale = [4, 8, 12, 16, 24, 32, 48];
  const scaleEl = document.getElementById("step-scale");
  if (!scaleEl) return;
  const tSlider = document.getElementById("step-target");
  const tVal = document.getElementById("step-target-val");
  const mSlider = document.getElementById("step-min");
  const mVal = document.getElementById("step-min-val");
  const targetOut = document.getElementById("step-target-out");
  const largerOut = document.getElementById("step-larger");
  const smallerOut = document.getElementById("step-smaller");
  const max = Math.max(...scale);

  scaleEl.innerHTML = scale.map((v, i) =>
    `<span class="bar" data-i="${i}" style="height:${(v / max) * 100}%"><span class="lbl">${v}px</span></span>`
  ).join("");
  scaleEl.querySelectorAll(".bar").forEach((b) =>
    b.addEventListener("click", () => { tSlider.value = b.dataset.i; tSlider.dispatchEvent(new Event("input")); }));

  const step = (fn, t, minDistance) => {
    const out = pick(scale, (s) => fn(px(t), s, { minDistance }), px);
    return out === null ? null : parseFloat(out);
  };

  function render () {
    const t = scale[Number(tSlider.value)];
    const md = Number(mSlider.value);
    tVal.textContent = `${t}px`; mVal.textContent = `${md}px`; targetOut.textContent = `${t}px`;
    const larger = step(nextLarger, t, md);
    const smaller = step(nextSmaller, t, md);
    largerOut.textContent  = larger  === null ? "no match" : `${larger}px`;
    smallerOut.textContent = smaller === null ? "no match" : `${smaller}px`;
    largerOut.parentElement.classList.toggle("error", larger === null);
    smallerOut.parentElement.classList.toggle("error", smaller === null);
    scaleEl.querySelectorAll(".bar").forEach((bar, i) => {
      const v = scale[i];
      bar.classList.remove("target","larger","smaller","dim");
      if (v === t) bar.classList.add("target");
      else if (v === larger) bar.classList.add("larger");
      else if (v === smaller) bar.classList.add("smaller");
      else bar.classList.add("dim");
    });
  }
  tSlider.addEventListener("input", render);
  mSlider.addEventListener("input", render);
  render();
})();

// — mostVivid / leastVivid —
(function demoVivid () {
  const stage = document.getElementById("vivid-stage");
  if (!stage) return;
  const palette = ["#de5331","#dab43d","#3c61a0","#479549","#eee9dc","#0d0a03"];
  const crown = pick(palette, (s) => mostVivid(s));
  const floor = pick(palette, (s) => leastVivid(s));
  // Sort by chroma so the highlighted tiles sit at opposite ends of the row.
  const sorted = [...palette].sort((a, b) => (lch(b).c || 0) - (lch(a).c || 0));
  stage.innerHTML = sorted.map((c) => {
    const C = lch(c).c || 0;
    const mark = c === crown ? "crown" : c === floor ? "floor" : "";
    return `<div class="vtile ${mark}" style="background:${c}">
      <span class="chroma">${C.toFixed(2)}</span><span>${c}</span></div>`;
  }).join("");
})();

// — lightest / darkest —
(function demoLightness () {
  const stage = document.getElementById("lightness-stage");
  const toggle = document.getElementById("lightness-readable");
  if (!stage || !toggle) return;
  const palette = ["#de5331","#dab43d","#3c61a0","#479549","#eee9dc","#0d0a03"];
  const SURFACE = "#eee9dc";

  function render () {
    const opts = toggle.checked ? { readableOn: color(SURFACE), readableContrast: 4.5 } : undefined;
    const hi = pick(palette, (s) => lightest(s, opts));
    const lo = pick(palette, (s) => darkest(s, opts));
    stage.innerHTML = palette.map((c) => {
      const readable = contrast(SURFACE, c) >= 4.5;
      const cls = [c === hi ? "is-lightest" : "", c === lo ? "is-darkest" : "",
                   toggle.checked && !readable ? "is-filtered" : ""].join(" ");
      const L = lch(c).l;
      return `<div class="ltile ${cls}" style="background:${c};color:${L > 0.6 ? "#0d0a03" : "#eee9dc"}">
        <span class="lval">L ${L.toFixed(2)}</span><span>${c}</span></div>`;
    }).join("");
  }
  toggle.addEventListener("change", render);
  render();
})();

// — random —
(function demoRandom () {
  const stage  = document.getElementById("random-stage");
  const seedEl = document.getElementById("random-seed");
  const shufEl = document.getElementById("random-shuffle");
  if (!stage || !seedEl || !shufEl) return;

  // Same palette as the vivid demo so the two read as a pair.
  const palette = ["#de5331","#dab43d","#3c61a0","#479549","#eee9dc","#0d0a03"];

  function render () {
    const seed = seedEl.value || "0";
    const picked = indexOfColor(palette, pick(palette, (s) => random(s, { type: "color", seed })));
    stage.innerHTML = palette.map((c, i) => `
      <div class="rtile ${i === picked ? "picked" : ""}" style="background:${c}">
        <span>${c}</span>
      </div>
    `).join("");
  }

  seedEl.addEventListener("input", render);
  shufEl.addEventListener("click", () => {
    seedEl.value = Math.random().toString(36).slice(2, 10);
    render();
  });
  render();
})();

// — nth —
(function demoNth () {
  const stage    = document.getElementById("nth-stage");
  const indexEl  = document.getElementById("nth-index");
  const presets  = document.getElementById("nth-presets");
  if (!stage || !indexEl) return;

  // 9-stop ramp, lightest → darkest — typical output of a ramp generator.
  const ramp = [
    "#efcdbb", "#eeb09a", "#ea9379",
    "#e57557", "#de5331", "#af4427",
    "#82351c", "#582713", "#311809",
  ];

  function render () {
    const n = parseFloat(indexEl.value);
    const picked = Number.isNaN(n) ? -1 : indexOfColor(ramp, pick(ramp, (s) => nth(s, n)));
    stage.style.setProperty("--nth-cols", ramp.length);
    stage.innerHTML = ramp.map((c, i) => {
      const label = `nth(${indexEl.value.trim()})`;
      return `<div class="ntile ${i === picked ? "picked" : ""}" data-label="${label}" style="background:${c}"><span>${c}</span></div>`;
    }).join("");
  }

  indexEl.addEventListener("input", () => {
    presets?.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.value === indexEl.value.trim()));
    render();
  });

  presets?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    indexEl.value = btn.dataset.value;
    presets.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
    render();
  });

  render();
})();

// — sibling —
(function demoSibling () {
  const stage   = document.getElementById("sibling-stage");
  const offsets = document.getElementById("sibling-offsets");
  const wrapEl  = document.getElementById("sibling-wrap");
  if (!stage || !offsets || !wrapEl) return;

  const GRAY = [
    ["g50", "#eee9dc"], ["g100", "#cec9bc"], ["g200", "#aeaa9d"], ["g300", "#908b7f"],
    ["g500", "#736e63"], ["g700", "#3c382e"], ["g900", "#0d0a03"],
  ];
  let anchor = "g100";
  let offset = 1;

  const b = new DesignBook("sibling-demo");
  const gray = b.addScope("gray");
  for (const [k, v] of GRAY) gray.set(k, color(v));
  const ui = b.addScope("ui");

  function render () {
    let result = null;
    try {
      ui.set("pick", sibling(ref(`gray.${anchor}`), offset, { wrap: wrapEl.checked }));
      result = b.resolve("ui.pick");
    } catch { /* leave unmarked */ }
    stage.innerHTML = GRAY.map(([k, v]) => {
      const cls = [k === anchor ? "is-anchor" : "", v === result && k !== anchor ? "is-pick" : ""].join(" ");
      const L = lch(v).l;
      return `<button type="button" class="stile ${cls}" data-key="${k}" style="background:${v};color:${L > 0.6 ? "#0d0a03" : "#eee9dc"}"
        aria-pressed="${k === anchor}"><span class="skey">${k}</span><span>${v}</span></button>`;
    }).join("");
  }

  stage.addEventListener("click", (e) => {
    const el = e.target.closest(".stile");
    if (!el) return;
    anchor = el.dataset.key;
    render();
  });
  offsets.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-offset]");
    if (!btn) return;
    offset = Number(btn.dataset.offset);
    offsets.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === btn));
    render();
  });
  wrapEl.addEventListener("change", render);
  render();
})();

// — setOrder: a scope that keeps itself sorted —
(function demoOrder () {
  const seedEl  = document.getElementById("order-seed-input");
  const modesEl = document.getElementById("order-modes");
  const host    = document.getElementById("order-swatches");
  if (!seedEl || !modesEl || !host) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Eight named colors on a hue wheel — constant L/C, evenly-spaced hues
  // rotated off the seed. Names are NOT in hue order, and the list is
  // declared scrambled, so insertion ≠ value ≠ name. The value orderer
  // (colorsort-js) walks the wheel, turning the scramble into a smooth arc.
  // [name, L, C, hueOffset]
  const SPEC = [
    ["orchid", 0.70, 0.14, "+330"],
    ["coral",  0.70, 0.14, "+20"],
    ["teal",   0.70, 0.14, "+190"],
    ["gold",   0.70, 0.14, "+85"],
    ["indigo", 0.70, 0.14, "+285"],
    ["fern",   0.70, 0.14, "+140"],
    ["rose",   0.70, 0.14, "+5"],
    ["azure",  0.70, 0.14, "+245"],
  ];

  // A real DesignBook — the scope genuinely sorts itself.
  const book = new DesignBook("order-demo");
  const seed = book.addScope("seed");
  seed.set("primary", color(seedEl.getAttribute("value") || "#de5331"));
  const palette = book.addScope("palette");
  for (const [name, L, C, H] of SPEC) {
    palette.set(name, relativeTo(ref("seed.primary"), "oklch", [L, C, H]));
  }

  const MODES = {
    "insertion":  null,
    "value-asc":  [{ by: "value", direction: "asc" }],   // dark → light
    "value-desc": [{ by: "value", direction: "desc" }],  // light → dark
    "name":       [{ by: "name" }],
  };
  let mode = "value-asc";

  // Persistent nodes keyed by token name so reorders can FLIP-animate.
  const tiles = new Map();
  for (const [name] of SPEC) {
    const el = document.createElement("div");
    el.className = "order-swatch";
    el.tabIndex = 0;
    el.innerHTML = `<span>${name}</span>`;
    tiles.set(name, el);
    host.appendChild(el);
  }

  function applyOrder () {
    const o = MODES[mode];
    if (o) palette.setOrder(o); else palette.clearOrder();
  }

  function render () {
    // FLIP — first: record current positions.
    const first = new Map();
    for (const [name, el] of tiles) first.set(name, el.getBoundingClientRect());

    // Reorder the DOM and repaint colors per the scope's canonical order.
    for (const name of palette.getAllKeys()) {
      const el = tiles.get(name);
      if (!el) continue;
      el.style.background = palette.resolve(name);
      host.appendChild(el); // move into sorted sequence
    }

    if (reduceMotion) return;
    // FLIP — last + invert + play.
    for (const [name, el] of tiles) {
      const f = first.get(name);
      const last = el.getBoundingClientRect();
      const dx = f.left - last.left;
      const dy = f.top - last.top;
      if (!dx && !dy) continue;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: 420, easing: "cubic-bezier(.22,.61,.36,1)" },
      );
    }
  }

  modesEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    mode = btn.dataset.mode;
    modesEl.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
    applyOrder();
    render();
  });

  const onSeed = () => {
    try { seed.set("primary", color(seedEl.value)); } catch { return; }
    render(); // colors re-derived → re-sorts under the current rule
  };
  seedEl.addEventListener("input", onSeed);
  seedEl.addEventListener("change", onSeed);

  applyOrder();
  render();
})();

// ══════════════════════════════════════════════════════════════════════
//  COLOR MIX — two endpoints, pick the path
// ══════════════════════════════════════════════════════════════════════
(function mixSection () {
  const aIn    = document.getElementById("mix-a");
  const bIn    = document.getElementById("mix-b");
  const strip  = document.getElementById("mix-strip");
  const spaceS = document.getElementById("mix-space-sel");
  if (!aIn || !bIn || !strip || !spaceS) return;

  const INITIAL_A = aIn.getAttribute("value") || "#de5331";
  const INITIAL_B = bIn.getAttribute("value") || "#3c61a0";
  aIn.value = INITIAL_A;
  bIn.value = INITIAL_B;

  const STOPS = 5;

  // The strip is the library's colorMix at five ratios — the same maths
  // the CSS renderer's color-mix() output produces in the browser.
  const mixBook = new DesignBook("mix-demo");
  const ends = mixBook.addScope("ends");
  const stops = mixBook.addScope("stops");

  function paint () {
    const a = aIn.value || INITIAL_A;
    const b = bIn.value || INITIAL_B;
    try {
      ends.set("a", color(a));
      ends.set("b", color(b));
    } catch { return; }
    const cells = [];
    for (let i = 0; i < STOPS; i++) {
      const ratio = i / (STOPS - 1);
      stops.set(`s${i}`, colorMix(ref("ends.a"), ref("ends.b"), { ratio, colorSpace: spaceS.value }));
      const out = mixBook.resolve(`stops.s${i}`);
      cells.push(`<span style="background:${out}" title="${out}"></span>`);
    }
    strip.innerHTML = cells.join("");
  }

  aIn.addEventListener("input", paint);
  aIn.addEventListener("change", paint);
  bIn.addEventListener("input", paint);
  bIn.addEventListener("change", paint);
  spaceS.addEventListener("change", paint);
  paint();
})();

// ══════════════════════════════════════════════════════════════════════
//  RAMP — one color in, eleven stops out
// ══════════════════════════════════════════════════════════════════════
(function rampSection () {
  const seedInput = document.getElementById("ramp-seed-input");
  const barsEl    = document.getElementById("ramp-bars");
  if (!seedInput || !barsEl) return;

  const SHADES = ["50","100","200","300","400","500","600","700","800","900","950"];
  const INITIAL_SEED = seedInput.getAttribute("value") || "#3c61a0";

  // The <color-input> custom element initialises its `.value` property
  // asynchronously after upgrade — read the `value` attribute as the
  // source of truth here, and assign the property so the element
  // reflects it on first paint.
  seedInput.value = INITIAL_SEED;

  // Tiny isolated book — keeps this demo independent of the hero book.
  const rampBook = new DesignBook("ramp-demo");
  const brand    = rampBook.addScope("brand");
  brand.set("primary", color(INITIAL_SEED));
  const palette  = rampBook.addScope("palette");
  for (const shade of SHADES) {
    palette.set(shade, ramp(ref("brand.primary"), { shade }));
  }

  // Render the bar skeleton once.
  for (const shade of SHADES) {
    const bar = document.createElement("div");
    bar.className = "ramp-bar";
    bar.dataset.shade = shade;
    bar.innerHTML = `<span class="shade">${shade}</span><span class="hex"></span>`;
    barsEl.appendChild(bar);
  }

  function paint () {
    const seed = seedInput.value || INITIAL_SEED;
    try {
      brand.set("primary", color(seed));
    } catch {
      return; // bad input, leave the bars on their last good state
    }
    for (const shade of SHADES) {
      const stopHex = rampBook.resolve(`palette.${shade}`);
      const bar = barsEl.querySelector(`[data-shade="${shade}"]`);
      bar.style.background = stopHex;
      bar.querySelector(".hex").textContent = stopHex;
      const L = lch(stopHex)?.l ?? 0.5;
      bar.style.color = L > 0.6 ? "#0d0a03" : "#eee9dc";
    }
  }

  seedInput.addEventListener("change", paint);
  seedInput.addEventListener("input", paint);
  paint();
})();

// ══════════════════════════════════════════════════════════════════════
//  TAB SWITCHERS — one panel at a time (ARIA tabs). The selector
//  switcher also follows #hash; the inheritance toggle does not.
// ══════════════════════════════════════════════════════════════════════
function wireTabs (list, { hash = false } = {}) {
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panelOf = (tab) => document.getElementById(tab.getAttribute("aria-controls"));

  function select (tab, { focus = false, updateHash = hash } = {}) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("is-active", on);
      panelOf(t)?.classList.toggle("is-active", on);
    }
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (updateHash) history.replaceState(null, "", `#${tab.getAttribute("aria-controls")}`);
  }

  list.addEventListener("click", (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  list.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length], { focus: true });
  });

  if (!hash) return;
  // A link to #closest (or any selector id) opens that panel.
  const fromHash = () => {
    const tab = tabs.find((t) => `#${t.getAttribute("aria-controls")}` === location.hash);
    if (tab) select(tab, { updateHash: false });
  };
  addEventListener("hashchange", fromHash);
  fromHash();
}

wireTabs(document.querySelector(".extends-modes"));

// ══════════════════════════════════════════════════════════════════════
//  REF — point at a source; relative refs re-bind in a variant scope
// ══════════════════════════════════════════════════════════════════════
(function refSection () {
  const sourceIn = document.getElementById("ref-source");
  const dangerIn = document.getElementById("ref-danger");
  const rowsEl   = document.getElementById("ref-rows");
  const cssEl    = document.getElementById("ref-css");
  const panesEl  = document.getElementById("ref-panes");
  if (!dangerIn || !rowsEl || !cssEl || !panesEl) return;

  // The first demo is a still picture; a source picker is optional.
  const SOURCE = sourceIn?.getAttribute("value") || "#3c61a0";
  const DANGER = dangerIn.getAttribute("value") || "#de5331";

  const book = new DesignBook("ref-demo");
  const brand = book.addScope("brand");
  brand.set("primary", color(SOURCE));
  brand.set("error",   color(DANGER));
  brand.set("ink",     color("#0d0a03"));
  brand.set("paper",   color("#eee9dc"));

  const ui = book.addScope("ui");
  ui.set("link",   ref("brand.primary"));
  ui.set("focus",  ref("ui.link"));
  ui.set("border", ref("ui.link"));

  const button = book.addScope("button");
  button.set("bg",    ref("brand.primary"));
  button.set("fg",    bestContrastWith(ref(".bg"), brand));
  button.set("hover", darken(ref(".bg"), { amount: 0.15 }));
  book.addScope("button-danger", { extends: "button" })
    .set("bg", ref("brand.error"));

  // The token as written: a ref with its key, a function by name.
  const written = (token) => token.type === "reference"
    ? `<span class="c-fn">ref</span>(<span class="c-str">'${token.key}'</span>)`
    : token.type === "color"
      ? `<span class="c-fn">color</span>(<span class="c-str">'${token.rawValue}'</span>)`
      : `<span class="c-fn">${token.name}</span>`;

  const row = (scope, name, label = name) => {
    const inherited = scope.isInherited(name);
    const value = book.resolve(`${scope.name}.${name}`);
    const raw = scope.getRaw(name);
    const source = inherited ? "inherit" : written(raw);
    // a plain color already says its value; only what is derived shows it
    const resolved = !inherited && raw.type === "color"
      ? ""
      : ` <span class="ext-resolved">→ ${value}</span>`;
    return `<div class="ext-row ext-row--${inherited ? "inherited" : "override"}">
      <span class="ext-key">${label}</span>
      <span class="ext-swatch" style="background:${value}"></span>
      <span class="ext-val">${source}${resolved}</span>
    </div>`;
  };

  const pane = (scope) => `<div class="extends-pane">
      <div class="extends-pane-head">
        <span class="extends-pane-name">${scope.name}</span>
        ${scope.extendsScope ? `<span class="extends-pane-meta">extends <code>${scope.extendsScope}</code></span>` : ""}
      </div>
      <div class="extends-rows">${["bg", "fg", "hover"].map((n) => row(scope, n)).join("")}</div>
    </div>`;

  function paint () {
    // the source first, then what points at it
    rowsEl.innerHTML = row(brand, "primary", "brand.primary")
      + ["link", "focus", "border"].map((n) => row(ui, n, `ui.${n}`)).join("");
    const lines = book.render("css-variables").split("\n")
      .filter((l) => /^\s*--(brand-primary|ui-[\w-]+):/.test(l))
      .map((l) => `  ${l.trim()}`);
    cssEl.textContent = [":root {", ...lines, "}"].join("\n");
    panesEl.innerHTML = [button, book.getScope("button-danger")].map(pane).join("");
  }

  const bind = (input, key, fallback) => {
    const update = () => {
      try { brand.set(key, color(input.value || fallback)); paint(); } catch {}
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  };
  if (sourceIn) bind(sourceIn, "primary", SOURCE);
  bind(dangerIn, "error", DANGER);

  paint();
})();

// ══════════════════════════════════════════════════════════════════════
//  inherited — a variant's hover: its parent's interaction color, two
//  steps lighter along the ramp
// ══════════════════════════════════════════════════════════════════════
(function parentSection () {
  const rampEl    = document.getElementById("ref-ramp");
  const buttonsEl = document.getElementById("ref-buttons");
  if (!rampEl || !buttonsEl) return;

  // a lively ramp with clear steps, so a move along it shows
  const BLUE = {
    "50": "#e9eefb", "100": "#ccd8f6", "200": "#a8bdef", "300": "#81a0e7", "400": "#5a82dd",
    "500": "#3965cf", "600": "#2c4fa8", "700": "#223c80", "800": "#182a59", "900": "#0e1833",
  };
  const book = new DesignBook("parent-demo");
  const blue = book.addScope("blue");
  for (const [step, value] of Object.entries(BLUE)) blue.set(step, color(value));
  const base = book.addScope("base");
  base.set("background", ref("blue.50"));
  base.set("interaction", ref("blue.600"));
  book.addScope("base-hover", { extends: "base" })
    .set("interaction", sibling(inherited(ref(".interaction")), ref("blue"), -2));

  const ink = (bg) => (contrast(bg, "#fffaed") >= contrast(bg, "#0d0a03") ? "#fffaed" : "#0d0a03");

  function paint () {
    const page = book.resolve("base.background");
    const rest = book.resolve("base.interaction");
    const hover = book.resolve("base-hover.interaction");
    const marks = (value) => [
      value === page ? "background" : null,
      value === rest ? "interaction" : null,
      value === hover ? "hover" : null,
    ].filter(Boolean);
    rampEl.innerHTML = Object.entries(BLUE).map(([step, value]) => `
      <div class="ref-ramp-step" style="background:${value};color:${ink(value)}">
        ${marks(value).map((m) => `<b>${m}</b>`).join("")}
        <span>${step}</span>
      </div>`).join("");
    // the page as a small piece of UI (.ui-card, as on the graph): its
    // button at rest (base) and, beside it, in its hover state (base-hover)
    const text = ink(page);
    const button = (bg) => `<span class="ui-card-button" style="background:${bg}"><span class="ui-card-line" style="background:${ink(bg)}"></span></span>`;
    buttonsEl.innerHTML = `
      <div class="ref-card">
        <span class="ref-card-name">base.interaction · base-hover.interaction</span>
        <div class="ui-card" aria-hidden="true" style="--card-surface:${page};--card-text:${text};--card-subtle:color-mix(in oklch, ${text} 45%, ${page})">
          <span class="ui-card-line ui-card-line--title"></span>
          <span class="ui-card-line"></span>
          <span class="ui-card-line ui-card-line--short"></span>
          <span class="ui-card-buttons">${button(rest)}${button(hover)}</span>
        </div>
      </div>`;
  }

  paint();
})();

// ══════════════════════════════════════════════════════════════════════
//  source — one hover rule, shared by two themes whose interaction colors
//  come from different ramps
// ══════════════════════════════════════════════════════════════════════
(function sourceSection () {
  const themesEl = document.getElementById("ref-themes");
  if (!themesEl) return;

  const RAMPS = {
    blue: ["#e9eefb", "#ccd8f6", "#a8bdef", "#81a0e7", "#5a82dd", "#3965cf", "#2c4fa8", "#223c80", "#182a59", "#0e1833"],
    green: ["#e7f6ec", "#c6ead2", "#9ddbb2", "#6fca8f", "#45b46f", "#2f9a58", "#257b47", "#1c5e37", "#134126", "#0a2616"],
  };
  const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
  const book = new DesignBook("source-demo");
  for (const [name, values] of Object.entries(RAMPS)) {
    const scope = book.addScope(name);
    values.forEach((value, i) => scope.set(STEPS[i], color(value)));
  }
  const button = book.addScope("button");
  button.set("interaction", ref("blue.500"));
  button.set("hover", sibling(source(ref(".interaction"), "root"), -2));
  book.addScope("button-green", { extends: "button" }).set("interaction", ref("green.500"));

  const page = "#eee9dc";
  const ink = "#0d0a03";
  const onButton = (bg) => (contrast(bg, "#fffaed") >= contrast(bg, ink) ? "#fffaed" : ink);
  const chip = (bg) => `<span class="ui-card-button" style="background:${bg}"><span class="ui-card-line" style="background:${onButton(bg)}"></span></span>`;
  themesEl.innerHTML = ["button", "button-green"].map((name) => `
    <div class="ref-card">
      <span class="ref-card-name">${name}: interaction · hover</span>
      <div class="ui-card" aria-hidden="true" style="--card-surface:${page};--card-text:${ink};--card-subtle:color-mix(in oklch, ${ink} 45%, ${page})">
        <span class="ui-card-line ui-card-line--title"></span>
        <span class="ui-card-line"></span>
        <span class="ui-card-line ui-card-line--short"></span>
        <span class="ui-card-buttons">${chip(book.resolve(`${name}.interaction`))}${chip(book.resolve(`${name}.hover`))}</span>
      </div>
    </div>`).join("");
})();

// ══════════════════════════════════════════════════════════════════════
//  The reason is the token — a surface that keeps moving, and the text
//  rule (the most vivid readable ink) deciding again each time
// ══════════════════════════════════════════════════════════════════════
(function whySection () {
  const sampleEl = document.getElementById("why-sample");
  const rowsEl   = document.getElementById("why-rows");
  if (!sampleEl || !rowsEl) return;
  rowsEl.setAttribute("data-ledger", "");

  const book = new DesignBook("why-demo");
  const ink = book.addScope("ink");
  ink.set("black",  color("#0d0a03"));
  ink.set("paper",  color("#fffaed"));
  ink.set("blue",   color("#172c4f"));
  ink.set("red",    color("#de5331"));
  ink.set("yellow", color("#dab43d"));
  ink.set("green",  color("#479549"));
  const ui = book.addScope("ui");
  ui.set("surface", color("#3965cf"));
  ui.set("text", mostVivid(ref("ink"), { readableOn: ref("ui.surface") }));

  const toHex = (c) => formatHex(c);
  // the surface drifts: hue goes round, lightness swings slowly, so the
  // pick crosses from light text to dark and through the colored inks
  const surfaceAt = (t) => toHex({ mode: "oklch", l: 0.55 + 0.33 * Math.sin(t / 2300), c: 0.13, h: (t / 40) % 360 });

  const row = (key, swatch, val) => `<div class="ext-row ext-row--override">
      <span class="ext-key">${key}</span>
      <span class="ext-swatch" style="background:${swatch}"></span>
      <span class="ext-val">${val}</span>
    </div>`;

  function paint (surface) {
    ui.set("surface", color(surface));
    let text;
    try {
      text = book.resolve("ui.text");
    } catch {
      return; // nothing reads on this one: keep the last pick on screen
    }
    sampleEl.style.background = surface;
    sampleEl.style.color = text;
    const name = ink.getAllKeys().find((k) => ink.resolve(k) === text) ?? text;
    rowsEl.innerHTML =
      row("ui.surface", surface, `<span class="ext-resolved">${surface}</span>`) +
      row("ui.text", text, `<span class="c-fn">mostVivid</span> <span class="ext-resolved">→ ink.${name} · ${contrast(surface, text).toFixed(1)}:1</span>`);
  }

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = false;
  let frame = 0;
  let lastPaint = 0;
  const tick = (t) => {
    if (!running) return;
    // a new surface a few times a second is enough to read
    if (t - lastPaint > 120) { paint(surfaceAt(t)); lastPaint = t; }
    frame = requestAnimationFrame(tick);
  };
  paint(surfaceAt(0));
  if (still) return;
  new IntersectionObserver(([entry]) => {
    running = entry.isIntersecting;
    if (running) frame = requestAnimationFrame(tick);
    else cancelAnimationFrame(frame);
  }).observe(sampleEl);
})();

// ══════════════════════════════════════════════════════════════════════
//  READABLE ON — contrast as a filter before ranking
// ══════════════════════════════════════════════════════════════════════
(function readableSection () {
  const surfaceIn = document.getElementById("readable-surface");
  const ratiosEl  = document.getElementById("readable-ratios");
  const poolEl    = document.getElementById("readable-pool");
  const resultsEl = document.getElementById("readable-results");
  if (!surfaceIn || !ratiosEl || !poolEl || !resultsEl) return;
  resultsEl.setAttribute("data-ledger", "");

  const BRAND = ["#de5331", "#dab43d", "#479549", "#3c61a0", "#0d0a03", "#fffaed"];
  const INITIAL = surfaceIn.getAttribute("value") || "#eee9dc";
  surfaceIn.value = INITIAL;
  let ratio = 4.5;

  const result = (call, surface, value, failMsg) => value
    ? `<div class="rd-result" style="background:${surface};color:${value}">
         <span class="rd-call" style="color:${contrast(surface, value) >= 3 ? value : "inherit"}">${call}</span>
         <span class="rd-sample">Read the docs →</span>
         <span class="rd-meta">${value} · ${contrast(surface, value).toFixed(2)}:1</span>
       </div>`
    : `<div class="rd-result is-fail" style="background:${surface}">
         <span class="rd-call">${call}</span>
         <span class="rd-sample" style="color:${contrast(surface, "#0d0a03") > 4.5 ? "#0d0a03" : "#eee9dc"}">${failMsg}</span>
       </div>`;

  function paint () {
    const surface = surfaceIn.value || INITIAL;
    if (!parse(surface)) return;
    poolEl.style.background = surface;
    poolEl.innerHTML = BRAND.map((c) => {
      const r = contrast(surface, c);
      return `<span class="rd-tile${r < ratio ? " is-out" : ""}" style="background:${c};color:${lch(c).l > 0.6 ? "#0d0a03" : "#eee9dc"}" title="${c} · ${r.toFixed(2)}:1">${r.toFixed(1)}</span>`;
    }).join("");

    const plain    = pick(BRAND, (s) => mostVivid(s));
    const readable = pick(BRAND, (s) => mostVivid(s, { readableOn: color(surface), readableContrast: ratio }));
    resultsEl.innerHTML =
      result("mostVivid(brand)", surface, plain) +
      result(`mostVivid(brand, { readableOn, readableContrast: ${ratio} })`, surface, readable,
             `throws — no member reaches ${ratio}:1`);
  }

  ratiosEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-ratio]");
    if (!btn) return;
    ratio = Number(btn.dataset.ratio);
    ratiosEl.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
    paint();
  });
  surfaceIn.addEventListener("input", paint);
  surfaceIn.addEventListener("change", paint);
  paint();
})();

// ══════════════════════════════════════════════════════════════════════
//  NAMES — one seed, a ramp of lighten/darken steps, keys from scaleNames
// ══════════════════════════════════════════════════════════════════════
(function namesSection () {
  const seedIn  = document.getElementById("names-seed-input");
  const schemes = document.getElementById("names-schemes");
  const countIn = document.getElementById("names-count");
  const countOut = document.getElementById("names-count-val");
  const rows    = document.getElementById("names-rows");
  const code    = document.getElementById("names-code");
  if (!seedIn || !schemes || !countIn || !rows || !code) return;

  const INITIAL = seedIn.getAttribute("value") || "#dab43d";
  seedIn.value = INITIAL;
  let scheme = "intensity";

  const b = new DesignBook("names-demo");
  const brand = b.addScope("brand");
  brand.set("primary", color(INITIAL));

  function paint () {
    const steps = Number(countIn.value);
    countOut.textContent = steps;
    try { brand.set("primary", color(seedIn.value || INITIAL)); } catch { return; }

    // A fresh scope each time: re-running is how a scale gets new names.
    if (b.getScope("palette")) b.deleteScope("palette");
    const palette = b.addScope("palette");
    const names = scaleNames(steps, scheme);
    names.forEach((name, i) => {
      const t = (i / (steps - 1)) * 2 - 1;          // -1 (lightest) … 1 (darkest)
      palette.set(name, t < 0
        ? lighten(ref("brand.primary"), { amount: -t * 0.9 })
        : darken(ref("brand.primary"), { amount: t * 0.8 }));
    });

    rows.innerHTML = names.map((name) => {
      const hex = b.resolve(`palette.${name}`);
      const ink = (lch(hex)?.l ?? 0.5) > 0.62 ? "#0d0a03" : "#eee9dc";
      return `<div class="names-row" style="background:${hex};color:${ink}"><span>${name}</span><code>${hex}</code></div>`;
    }).join("");

    const S = (x) => `<span class="c-str">'${x}'</span>`, F = (x) => `<span class="c-fn">${x}</span>`, N = (x) => `<span class="c-num">${x}</span>`;
    code.innerHTML =
`<span class="c-fn">const</span> seed = ${F("ref")}(${S("brand.primary")});
${F("scaleNames")}(${N(steps)}, ${S(scheme)}).${F("forEach")}((name, i) =&gt; {
  <span class="c-fn">const</span> t = i / ${N(steps - 1)} * ${N(2)} - ${N(1)};  <span class="c-dim">// -1 … 1</span>
  palette.${F("set")}(name, t &lt; ${N(0)}
    ? ${F("lighten")}(seed, { <span class="c-key">amount</span>: -t * ${N(".9")} })
    : ${F("darken")}(seed, { <span class="c-key">amount</span>: t * ${N(".8")} }));
});`;  }

  schemes.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-scheme]");
    if (!btn) return;
    scheme = btn.dataset.scheme;
    schemes.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === btn));
    paint();
  });
  countIn.addEventListener("input", paint);
  seedIn.addEventListener("input", paint);
  seedIn.addEventListener("change", paint);
  paint();
})();

// — copy buttons —
document.querySelectorAll(".install-copy, .copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); } catch {}
    const orig = btn.textContent;
    btn.textContent = "Copied ✓";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1400);
  });
});
