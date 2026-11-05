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
  string,
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
  nextLighter,
  nextDarker,
  random,
  nth,
  sibling,
  inherited,
  source,
} from "../../src/index";

import { Poline, positionFunctions } from "poline/picker"; // also defines <poline-picker>
import { tailwindRamps } from "dittotones/ramps/tailwind";
import { radixRamps } from "dittotones/ramps/radix";

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
  // A chart of decisions in the manner of the old radial plates: a segment
  // per selector, labelled round the rim; a ring per palette color, from
  // the hub out; in each segment the color that selector picks is a solid
  // band, the others a thin line of their color. The hub holds the target
  // (the color picker), and every selector here reads it, so every segment
  // picks again when it changes (one with nothing on its side is empty).
  const chart    = document.getElementById("hc-chart");
  const centerEl = document.getElementById("hi-center");
  if (!chart || !centerEl) return;

  const PALETTE = ["#de5331", "#dab43d", "#479549", "#3c61a0", "#eee9dc", "#0d0a03"];
  const INITIAL_CENTER = centerEl.getAttribute("value") || "#0d0a03";
  centerEl.value = INITIAL_CENTER;
  let CENTER = INITIAL_CENTER;

  const SELECTORS = [
    ["bestContrastWith", (s) => bestContrastWith(color(CENTER), s)],
    ["minContrastWith",  (s) => minContrastWith(color(CENTER), s, { minContrast: 3 })],
    ["closest",          (s) => closest(color(CENTER), s)],
    ["furthestFrom",     (s) => furthestFrom(color(CENTER), s)],
    ["nextLighter",      (s) => nextLighter(color(CENTER), s)],
    ["nextDarker",       (s) => nextDarker(color(CENTER), s)],
    ["mostVivid",  (s) => mostVivid(s, { readableOn: color(CENTER) })],
    ["leastVivid", (s) => leastVivid(s, { readableOn: color(CENTER) })],
  ];

  const HUB = 44, RIM = 164, LABEL = 178, OUTER = 192;
  const ringW = (RIM - HUB) / PALETTE.length;
  const seg = (2 * Math.PI) / SELECTORS.length;
  const pt = (r, a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
  // a ring sector; `gap` pulls its sides in by that much (in units, about
  // a pixel each), so neighbouring segments stand apart
  const sector = (r0, r1, a0, a1, gap = 0) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const i0 = a0 + gap / r0, i1 = a1 - gap / r0, o0 = a0 + gap / r1, o1 = a1 - gap / r1;
    return `M${pt(r0, i0)} L${pt(r1, o0)} A${r1} ${r1} 0 ${large} 1 ${pt(r1, o1)} L${pt(r0, i1)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, i0)}Z`;
  };
  // Between two segments: 1px of paper with a black line on each side of
  // it (0.8 wide, centred 0.9 out from the division). The cells stop at
  // the lines' outer edge (0.5 + 0.8).
  const EDGE = 0.9, GAP_PICK = 1.3, GAP_BAND = 1.3;
  // a straight line parallel to the division at angle a, `d` to its side
  const edge = (a, d, r0, r1) => {
    const off = (r) => { const [x, y] = pt(r, a).split(" ").map(Number); return `${(x + d * Math.cos(a)).toFixed(2)} ${(y + d * Math.sin(a)).toFixed(2)}`; };
    return `M${off(r0)} L${off(r1)}`;
  };
  // an arc to set a label on, read left to right on either half
  const arc = (r, a0, a1) => {
    const mid = (a0 + a1) / 2;
    const lower = Math.cos(mid) < 0;
    return lower
      ? `M${pt(r, a1)} A${r} ${r} 0 0 0 ${pt(r, a0)}`
      : `M${pt(r, a0)} A${r} ${r} 0 0 1 ${pt(r, a1)}`;
  };

  // The wedges across the page: a segment that picked black carries on in
  // black, faint; the segment under the pointer carries on in the color it
  // picked, whatever that is.
  let lastPicks = [];
  let hovered = -1;
  const PAPER = "#eee9dc", INK = "#0d0a03";
  function paintWedges () {
    const deg = 360 / SELECTORS.length;
    const stops = SELECTORS.map((_, i) => {
      const pickColor = PALETTE[lastPicks[i]];
      // the paper on the paper would not show: a grey for it
      const tint = (col) => col === INK ? `color-mix(in srgb, ${INK} 10%, transparent)`
        : col === PAPER ? `color-mix(in srgb, ${INK} 6%, transparent)`
        : `color-mix(in srgb, ${col} 20%, transparent)`;
      const c = i === hovered && pickColor ? tint(pickColor)
        : pickColor === INK ? tint(INK)
        : "transparent";
      return `${c} ${i * deg}deg ${(i + 1) * deg}deg`;
    }).join(", ");
    document.querySelector(".hero-glow")?.style.setProperty("--glow", stops);
  }

  function draw () {
    const picks = SELECTORS.map(([, fn]) => indexOfColor(PALETTE, pick(PALETTE, fn)));
    let out = "<defs>";
    SELECTORS.forEach(([name], i) => {
      const a0 = i * seg + 0.02, a1 = (i + 1) * seg - 0.02;
      const lower = Math.cos((a0 + a1) / 2) < 0;
      out += `<path id="hc-l${i}" d="${arc(lower ? LABEL + 1.5 : LABEL - 4.5, a0, a1)}"/>`;
    });
    out += "</defs>";
    // the labels' band, always the paper
    out += `<path class="hc-label-band" fill-rule="evenodd" d="M${OUTER} 0A${OUTER} ${OUTER} 0 1 0 ${-OUTER} 0A${OUTER} ${OUTER} 0 1 0 ${OUTER} 0ZM${RIM} 0A${RIM} ${RIM} 0 1 1 ${-RIM} 0A${RIM} ${RIM} 0 1 1 ${RIM} 0Z"/>`;
    let marks = "";
    // the cells
    SELECTORS.forEach((_, i) => {
      const a0 = i * seg, a1 = (i + 1) * seg;
      PALETTE.forEach((c, m) => {
        const r0 = HUB + m * ringW, r1 = r0 + ringW;
        if (picks[i] === m) {
          // the pick: the whole cell in its color, outlined, a diamond in
          // its middle (so a pick the color of the paper still shows)
          out += `<path class="hc-pick" d="${sector(r0, r1, a0, a1, GAP_PICK)}" fill="${c}"/>`;
          // a circle in the middle of the cell, a paper ring round its black one
          const [cx, cy] = pt((r0 + r1) / 2, (a0 + a1) / 2).split(" ").map(Number);
          marks += `<circle class="hc-mark-halo" cx="${cx}" cy="${cy}" r="4.5"/><circle class="hc-mark" cx="${cx}" cy="${cy}" r="4.5"/>`;
        } else {
          // not picked: a slim band, a quarter of the ring, its color still there
          const mid = (r0 + r1) / 2, h = ringW / 8;
          out += `<path class="hc-band" d="${sector(mid - h, mid + h, a0, a1, GAP_BAND)}" fill="${c}"/>`;
        }
      });
    });
    // the rules: a circle between rings, a line between segments, the rim
    for (let m = 0; m <= PALETTE.length; m++) out += `<circle class="hc-rule" r="${HUB + m * ringW}"/>`;
    out += `<circle class="hc-rule" r="${OUTER}"/><circle class="hc-rule hc-thin" r="${OUTER - 3}"/>`;
    // fine spokes through each segment, as on the plates
    SELECTORS.forEach((_, i) => {
      for (let k = 1; k < 4; k++) {
        const a = (i + k / 4) * seg;
        out += `<path class="hc-rule hc-thin" d="M${pt(HUB, a)} L${pt(RIM, a)}"/>`;
      }
    });
    SELECTORS.forEach((_, i) => {
      const a = i * seg;
      // through the rim one line; through the rings a line on each side of
      // the 1px gap
      out += `<path class="hc-rule" d="M${pt(RIM, a)} L${pt(OUTER, a)}"/>`;
      out += `<path class="hc-rule" d="${edge(a, EDGE, HUB, RIM)}"/><path class="hc-rule" d="${edge(a, -EDGE, HUB, RIM)}"/>`;
      // a small diamond on the rim at each division
      const [x, y] = pt(OUTER - 1.5, a).split(" ").map(Number); // between the rim's two lines
      out += `<rect class="hc-tick" x="${x - 4}" y="${y - 4}" width="8" height="8" transform="rotate(45 ${x} ${y})"/>`;
    });
    // the labels, along the rim
    SELECTORS.forEach(([name], i) => {
      out += `<text class="hc-label"><textPath href="#hc-l${i}" startOffset="50%" text-anchor="middle">${name}</textPath></text>`;
    });
    // the hub: a rosette round the target
    out += `<circle class="hc-hub" r="${HUB - 2}"/><circle class="hc-rule" r="${HUB - 8}"/><circle class="hc-rule hc-thin" r="${HUB - 11}"/>`;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      out += `<path class="hc-rule hc-thin" d="M${pt(HUB - 8, a)} L${pt(HUB - 2, a)}"/>`;
    }
    // ticks between the turning pie and the next ring: north, east, south
    // and west stop 2 short of the ring, the diagonals halfway, the
    // others are short
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      const end = k % 6 === 0 ? HUB - 13 : k % 3 === 0 ? PIE_R + 9 : PIE_R + 5;
      // only the long ones touch the pie; the rest stand 2 off it
      const start = k % 6 === 0 ? PIE_R : PIE_R + 2;
      out += `<path class="hc-rule hc-thin" d="M${pt(start, a)} L${pt(end, a)}"/>`;
    }
    // the rings' key on the axis straight down: a diamond per ring with
    // its color's initial
    const KEY = ["R", "Y", "G", "B", "W", "B"];
    PALETTE.forEach((_, m) => {
      const r = HUB + (m + 0.5) * ringW;
      const [x, y] = pt(r, Math.PI).split(" ").map(Number);
      // a diamond with its points cut off: flat on the left and right, a
      // little at the top and bottom
      marks += `<path class="hc-key" d="M${x - 1} ${y - 6} L${x + 1} ${y - 6} L${x + 4} ${y - 3} L${x + 4} ${y + 3} L${x + 1} ${y + 6} L${x - 1} ${y + 6} L${x - 4} ${y + 3} L${x - 4} ${y - 3}Z"/>`;
      marks += `<text class="hc-key-label" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${KEY[m]}</text>`;
    });
    // the picks' diamonds last, on top of every rule
    cells.innerHTML = out + marks;
    lastPicks = picks;
    paintWedges();
  }

  // Each segment leads to its selector's section. The links are a layer of
  // their own, drawn once, so hovering one survives the redraws.
  const ANCHOR = {
    bestContrastWith: "best-contrast", minContrastWith: "min-contrast",
    closest: "closest", furthestFrom: "furthest",
    nextLighter: "closest", nextDarker: "closest",
    mostVivid: "vivid", leastVivid: "vivid",
  };
  const cells = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const links = document.createElementNS("http://www.w3.org/2000/svg", "g");
  links.setAttribute("class", "hc-links");
  chart.append(cells, links);
  // While the target drifts on its own, the hub shows the palette instead
  // of the target: a pie of its colors, turning. The picker stays on top,
  // invisible, so the first touch lands on it, stops the drift and shows
  // the picker again.
  const pie = document.createElementNS("http://www.w3.org/2000/svg", "g");
  pie.setAttribute("class", "hc-pie");
  const PIE_R = 16;
  pie.innerHTML = PALETTE.map((c, k) => {
    const a0 = (k / PALETTE.length) * 2 * Math.PI, a1 = ((k + 1) / PALETTE.length) * 2 * Math.PI;
    return `<path d="M0 0 L${pt(PIE_R, a0)} A${PIE_R} ${PIE_R} 0 0 1 ${pt(PIE_R, a1)}Z" fill="${c}"/>`;
  }).join("") + `<circle class="hc-pie-rim" r="${PIE_R}"/><circle class="hc-pie-eye" r="5"/>`;
  chart.append(pie);
  // A segment breaks out of the circle: its wedge, crisp, carries on
  // across the page behind the chart (which, and in what: paintWedges).
  // It is clipped to a box from the top of the first screen down to the
  // next section title's line, so the wedges run on behind that title's
  // hatching; the box and the hub's place in it are measured, again on
  // resize.
  const hero = chart.closest("section");
  const clip = document.createElement("div");
  clip.className = "hero-glow-clip";
  clip.setAttribute("aria-hidden", "true");
  const glow = document.createElement("div");
  glow.className = "hero-glow";
  clip.append(glow);
  hero.prepend(clip);
  const nextTitle = hero.nextElementSibling?.querySelector(".rule-title");
  const placeGlow = () => {
    const h = hero.getBoundingClientRect();
    const hub = chart.ownerSVGElement.getBoundingClientRect();
    const end = nextTitle ? nextTitle.getBoundingClientRect().bottom : h.bottom;
    clip.style.height = `${end - h.top}px`;
    glow.style.left = `${hub.left + hub.width / 2 - h.left}px`;
    glow.style.top = `${hub.top + hub.height / 2 - h.top}px`;
    // the wedges start at the chart's outer edge: its label band stays
    // the page behind it
    glow.style.setProperty("--hole", `${(hub.width * 192) / 400}px`);
  };
  placeGlow();
  new ResizeObserver(placeGlow).observe(hero);
  if (document.fonts) document.fonts.ready.then(placeGlow);
  links.innerHTML = SELECTORS.map(([name], i) =>
    // the rings wash on hover; the label's band is part of the link but
    // keeps the page behind it
    `<a href="#${ANCHOR[name]}" aria-label="${name}"><path class="hc-hit" d="${sector(HUB, RIM, i * seg, (i + 1) * seg)}"/><path class="hc-hit hc-hit-label" d="${sector(RIM, OUTER, i * seg, (i + 1) * seg)}"/></a>`).join("");
  [...links.children].forEach((a, i) => {
    const on = () => { hovered = i; paintWedges(); };
    const off = () => { if (hovered === i) { hovered = -1; paintWedges(); } };
    a.addEventListener("pointerenter", on);
    a.addEventListener("pointerleave", off);
    a.addEventListener("focus", on);
    a.addEventListener("blur", off);
  });

  function onCenterChange () {
    const v = centerEl.value;
    if (!v) return;
    CENTER = v;
    draw();
  }

  // Until someone takes the picker, the target turns slowly round the hue
  // wheel while its lightness zigzags, and the picks follow it. Stops for
  // good on the first touch; pauses while the chart is off screen; never
  // runs for reduced motion.
  let drifting = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visible = true;
  let hue = 30;
  // lightness bounces 0 → 100 → 0 (|i mod 200 − 100|), on a period of its
  // own, so hue and lightness keep meeting anew
  let i = 0;
  const showPie = (on) => {
    pie.style.display = on ? "" : "none";
    centerEl.classList.toggle("is-hidden", on);
  };
  const stopDrift = () => { drifting = false; showPie(false); };
  for (const type of ["pointerdown", "focusin", "keydown"]) centerEl.addEventListener(type, stopDrift);

  let timer = 0;
  function drift () {
    if (!drifting) { clearInterval(timer); timer = 0; return; }
    hue = (hue + 2) % 360;
    const light = Math.abs((i += 3) % 200 - 100) / 100;
    const value = formatHex({ mode: "oklch", l: 0.22 + 0.7 * light, c: 0.14, h: hue });
    centerEl.value = value;
    CENTER = value;
    draw();
  }

  // (input / change also fire when the drift sets the value, so they do not
  // stop it; a person's input always starts with a press, focus or key)
  centerEl.addEventListener("change", onCenterChange);
  centerEl.addEventListener("input", onCenterChange);
  draw();
  // The timer runs only while the chart is on screen and the tab shown.
  const run = () => {
    const on = drifting && visible && !document.hidden;
    if (on && !timer) timer = setInterval(drift, 140);
    if (!on && timer) { clearInterval(timer); timer = 0; }
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }).observe(chart.ownerSVGElement);
  document.addEventListener("visibilitychange", run);
  showPie(drifting);
  run();
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
  // the demo book and called through a real function token. Its target
  // hue is the slider's (50° in the sample).
  const chart = document.getElementById("extend-fn-chart");
  const hueIn = document.getElementById("extend-fn-hue");
  const hueOut = document.getElementById("extend-fn-hue-val");
  let target = 50;
  const ext = buildBook();
  const score = (v) => {
    const { c = 0, h = 0 } = lch(v) ?? {};
    return c * Math.cos(((h - target) * Math.PI) / 180);
  };
  ext.registerFunction("warmest", (scope) => {
    let best = null, bestScore = -Infinity;
    for (const key of scope.getAllKeys()) {
      const v = scope.resolve(key);
      const s = score(v);
      if (s > bestScore) { bestScore = s; best = v; }
    }
    return best;
  });
  const values = ext.getScope("values");
  const ui = ext.getScope("ui");

  // The chart: each member at its hue angle, its chroma the distance from
  // the centre; an axis toward the target hue, each member dropped onto it
  // (the foot is its score), the one reaching furthest ringed.
  const R = 110; // the full box, as the Poline picker's circle
  const at = (deg, r) => [r * Math.cos((deg * Math.PI) / 180), -r * Math.sin((deg * Math.PI) / 180)];
  function paint () {
    ui.set("warm", createFunctionToken("warmest", [values]));
    const winner = ext.resolve("ui.warm");
    const members = values.getAllKeys().map((k) => values.resolve(k));
    const maxC = Math.max(0.2, ...members.map((v) => lch(v)?.c ?? 0));
    const [ax, ay] = at(target, R);
    let svg = `<circle class="ring" r="${R}"/><circle class="ring faint" r="${R / 2}"/>`;
    svg += `<line class="axis" x1="${-ax}" y1="${-ay}" x2="${ax}" y2="${ay}"/>`;
    svg += `<circle class="axis-end" cx="${ax}" cy="${ay}" r="3"/>`;
    for (const v of members) {
      const { c = 0, h = 0 } = lch(v) ?? {};
      const r = (c / maxC) * R;
      const [x, y] = at(h || 0, r);
      const [fx, fy] = at(target, (score(v) / maxC) * R);
      svg += `<line class="drop" x1="${x}" y1="${y}" x2="${fx}" y2="${fy}"/>`;
      if (v === winner) svg += `<circle class="win" cx="${x}" cy="${y}" r="10"/>`;
      svg += `<circle class="dot" cx="${x}" cy="${y}" r="6" fill="${v}"/>`;
    }
    chart.innerHTML = svg;
    document.getElementById("extend-fn-swatch").style.background = winner;
    document.getElementById("extend-fn-hex").textContent = winner;
  }
  hueIn?.addEventListener("input", () => {
    target = Number(hueIn.value);
    if (hueOut) hueOut.textContent = `${target}°`;
    paint();
  });
  paint();
})();

(function extendPoline () {
  const strip = document.getElementById("extend-poline-strip");
  const swatchOut = document.getElementById("extend-poline-swatch");
  const hexOut = document.getElementById("extend-poline-hex");
  const picker = document.getElementById("extend-poline-picker");
  if (!strip) return;

  // Two anchors on opposite sides of the wheel at the same lightness: the
  // line between them runs straight through the centre. Five points
  // between them, seven colors in all. Anchors are [hue, s 0–1, l 0–1].
  const poline = new Poline({
    anchorColors: [[12, 0.85, 0.75], [192, 0.85, 0.75]],
    numPoints: 5,
    positionFunction: positionFunctions.linearPosition,
  });

  function fill () {
    const cssColors = poline.colorsCSS;
    strip.innerHTML = cssColors.map((c) => `<span style="background:${c}"></span>`).join("");
    const hexes = cssColors.map((c) => hex(parse(c))).filter(Boolean);
    const surface = book.getScope("ui").resolve("surface");
    const border = pick(hexes, (s) => minContrastWith(color(surface), s, { minContrast: 3 }));
    const shown = border || hexes[0];
    if (shown) {
      swatchOut.style.background = shown;
      hexOut.textContent = shown;
    }
  }

  if (picker) {
    // Styled as on the home page: no wheel, its outline; flat dots.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      .picker::before { display: none; }
      .picker::after { content: ""; position: absolute; inset: 0; z-index: 1;
        border-radius: 50%; border: 1px solid var(--poline-picker-line-color); pointer-events: none; }
      .wheel__line { stroke-dasharray: 1 1; }
      .wheel__point { r: 2.6px; stroke: none; }
      .wheel__anchor { r: 4.2px; stroke: none; }
      .wheel__saturation-ring { display: none; }
      .wheel__outlines circle { fill: none; stroke: var(--poline-picker-line-color); pointer-events: none; }
    `);
    // As on the home page: the ends in their own color, and every dot
    // ringed (1px away, a 1px line) in a group of our own that the
    // picker's redraws never touch.
    const SVG_NS = "http://www.w3.org/2000/svg";
    const paintAnchors = () => {
      const root = picker.shadowRoot;
      const svg = root?.querySelector("svg");
      const wheel = root?.querySelector(".wheel");
      if (!svg || !wheel) return;
      const anchors = [...root.querySelectorAll(".wheel__anchor")];
      for (const a of anchors) a.style.fill = a.getAttribute("fill");
      let outlines = wheel.querySelector(".wheel__outlines");
      if (!outlines) {
        outlines = document.createElementNS(SVG_NS, "g");
        outlines.setAttribute("class", "wheel__outlines");
        wheel.append(outlines);
      }
      const px = 100 / (svg.clientWidth || 224);
      const near = (a, b) => Math.hypot(a.getAttribute("cx") - b.getAttribute("cx"), a.getAttribute("cy") - b.getAttribute("cy")) < 4.5;
      const dots = [...anchors, ...[...root.querySelectorAll(".wheel__point")].filter((p) => !anchors.some((a) => near(a, p)))];
      while (outlines.children.length > dots.length) outlines.lastElementChild.remove();
      dots.forEach((dot, i) => {
        const ring = outlines.children[i] ?? outlines.appendChild(document.createElementNS(SVG_NS, "circle"));
        const r = parseFloat(getComputedStyle(dot).r) || Number(dot.getAttribute("r"));
        ring.setAttribute("cx", dot.getAttribute("cx"));
        ring.setAttribute("cy", dot.getAttribute("cy"));
        ring.setAttribute("r", String(r + px * 1.5));
        ring.setAttribute("stroke-width", String(px));
      });
    };
    const ready = () => {
      if (!picker.shadowRoot) return requestAnimationFrame(ready);
      picker.shadowRoot.adoptedStyleSheets = [...picker.shadowRoot.adoptedStyleSheets, sheet];
      picker.setPoline(poline);
      paintAnchors();
    };
    ready();

    // Dragging anywhere turns the whole line round the centre.
    const turn = (deg) => { poline.shiftHue(deg); picker.updateSVG(); paintAnchors(); fill(); };
    const angleAt = (e) => {
      const r = picker.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };
    picker.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      picker.setPointerCapture(e.pointerId);
      let last = angleAt(e);
      const move = (ev) => {
        const now = angleAt(ev);
        const d = ((now - last + 540) % 360) - 180;
        last = now;
        if (d) turn(d);
      };
      const up = () => { picker.removeEventListener("pointermove", move); picker.removeEventListener("pointerup", up); };
      picker.addEventListener("pointermove", move);
      picker.addEventListener("pointerup", up);
    }, true);
    picker.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
      if (!step) return;
      e.preventDefault();
      turn(step);
    });
    picker.addEventListener("poline-change", () => { paintAnchors(); fill(); });
  }
  fill();
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
    if (el.classList.contains("min-sample--lines")) {
      // decoration: ruled lines in the pick, the reading under them in the body's ink
      el.style.setProperty("--line", text);
      out.style.color = "#564f44";
      out.innerHTML = `<span style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.04em">${text} · ${contrast(surface, text).toFixed(2)}:1</span>`;
      return;
    }
    out.style.color = text;
    out.innerHTML =
      `<span class="min-aa">Aa</span><br>
       <span style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.04em;opacity:.75">${text} · ${contrast(surface, text).toFixed(1)}:1</span>`;
  }
  paint("min-sample-12", 1.2); paint("min-sample-3", 3); paint("min-sample-45", 4.5); paint("min-sample-7", 7);
})();

// — minContrastWith, sizes: the smallest heading that still stands a ratio
//   above the body text —
(function demoMinSizes () {
  const scaleEl = document.getElementById("ms-scale");
  const heading = document.getElementById("ms-heading");
  const readout = document.getElementById("ms-readout");
  const slider = document.getElementById("ms-ratio");
  if (!scaleEl || !heading || !readout || !slider) return;

  const SIZES = [12, 14, 16, 18, 20, 24, 30, 36, 48];
  const book = new DesignBook("min-sizes");
  const type = book.addScope("type");
  for (const n of SIZES) type.set(`s${n}`, px(n));
  type.set("body", ref("type.s16"));
  const ui = book.addScope("ui");

  function paint () {
    const ratio = Number(slider.value);
    ui.set("heading", minContrastWith(ref("type.body"), ref("type"), { minContrast: ratio, direction: "larger" }));
    let pick = null;
    try { pick = book.resolve("ui.heading"); } catch { /* nothing that large */ }
    const n = pick ? parseFloat(pick) : null;
    scaleEl.innerHTML = SIZES.map((s) =>
      `<span class="${s === n ? "is-pick" : ""}${s === 16 ? " is-body" : ""}">${s}</span>`).join("");
    heading.style.fontSize = pick ?? "16px";
    heading.classList.toggle("is-none", !pick);
    readout.innerHTML = pick
      ? `16px × ${ratio.toFixed(2)} → <b>${pick}</b> · ${(n / 16).toFixed(2)}:1`
      : `16px × ${ratio.toFixed(2)} → nothing in the scale is that large`;
  }
  slider.addEventListener("input", paint);
  paint();
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
  const again = document.getElementById("vivid-new");
  const lo = document.getElementById("vivid-lo");
  const hi = document.getElementById("vivid-hi");
  const band = document.querySelector("#vivid-range .range2-band");
  const val = document.getElementById("vivid-val");
  if (!stage || !lo || !hi) return;
  let palette = ["#de5331", "#dab43d", "#3c61a0", "#479549", "#eee9dc", "#0d0a03"];

  function render () {
    const range = [Number(lo.value), Number(hi.value)];
    const opts = range[0] > 0 || range[1] < 1 ? { lightness: range } : undefined;
    let crown = null, floor = null;
    try {
      crown = pick(palette, (s) => mostVivid(s, opts));
      floor = pick(palette, (s) => leastVivid(s, opts));
    } catch { /* nothing in the band */ }
    // In the palette's own order: the picks land wherever they are.
    stage.innerHTML = palette.map((c) => {
      const l = lch(c).l;
      const mark = c === crown ? "crown" : c === floor ? "floor" : "";
      const out = l < range[0] - 1e-9 || l > range[1] + 1e-9 ? " is-out" : "";
      return `<div class="vtile ${mark}${out}" style="background:${c}" title="${c} · L ${l.toFixed(2)}"></div>`;
    }).join("");
    // the band between the two handles, where their tips are
    const thumb = 13, w = lo.clientWidth - thumb;
    band.style.left = `${thumb / 2 + range[0] * w}px`;
    band.style.width = `${(range[1] - range[0]) * w}px`;
    val.textContent = `${range[0].toFixed(2)}–${range[1].toFixed(2)}`;
  }
  // the two handles never cross
  lo.addEventListener("input", () => { if (Number(lo.value) > Number(hi.value)) lo.value = hi.value; render(); });
  hi.addEventListener("input", () => { if (Number(hi.value) < Number(lo.value)) hi.value = lo.value; render(); });
  new ResizeObserver(render).observe(lo);

  // six colors anywhere in OKLCH: any hue, muted to loud, dark to light
  const randomPalette = () => Array.from({ length: 6 }, () => formatHex({
    mode: "oklch",
    l: 0.3 + Math.random() * 0.6,
    c: Math.random() * 0.2,
    h: Math.random() * 360,
  }));

  render();
  again?.addEventListener("click", () => { palette = randomPalette(); render(); });
})();

// — lightest / darkest —
(function demoLightness () {
  const stage = document.getElementById("lightness-stage");
  const toggle = document.getElementById("lightness-readable");
  const again = document.getElementById("lightness-new");
  if (!stage || !toggle) return;
  let palette = ["#de5331","#dab43d","#3c61a0","#479549","#eee9dc","#0d0a03"];
  const SURFACE = "#eee9dc";

  function render () {
    const opts = toggle.checked ? { readableOn: color(SURFACE), readableContrast: 4.5 } : undefined;
    let hi = null, lo = null;
    try {
      hi = pick(palette, (s) => lightest(s, opts));
      lo = pick(palette, (s) => darkest(s, opts));
    } catch { /* nothing reads on the page */ }
    // In the palette's own order: the picks land wherever they are.
    stage.innerHTML = palette.map((c) => {
      const readable = contrast(SURFACE, c) >= 4.5;
      const cls = [c === hi ? "is-lightest" : "", c === lo ? "is-darkest" : "",
                   toggle.checked && !readable ? "is-out" : ""].join(" ");
      return `<div class="ltile ${cls}" style="background:${c}" title="${c} · L ${lch(c).l.toFixed(2)}"></div>`;
    }).join("");
  }
  // six colors, one in each sixth of the lightness range (so some always
  // read on the page), any hue, muted to loud, in a shuffled order
  const randomPalette = () => Array.from({ length: 6 }, (_, i) => formatHex({
    mode: "oklch",
    l: 0.15 + ((i + Math.random()) / 6) * 0.8,
    c: Math.random() * 0.2,
    h: Math.random() * 360,
  })).sort(() => Math.random() - 0.5);
  toggle.addEventListener("change", render);
  again?.addEventListener("click", () => { palette = randomPalette(); render(); });
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
    stage.innerHTML = palette.map((c, i) =>
      `<div class="rtile ${i === picked ? "picked" : ""}" style="background:${c}" title="${c}"></div>`).join("");
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
  const rows     = document.getElementById("nth-rows");
  const indexEl  = document.getElementById("nth-index");
  const readout  = document.getElementById("nth-readout");
  if (!rows || !indexEl) return;

  // a spacing scale, smallest → largest, as a generator writes it
  const SCALE = [["3xs", 2], ["2xs", 4], ["xs", 8], ["s", 12], ["m", 16], ["l", 24], ["xl", 32], ["2xl", 48], ["3xl", 64]];
  const book = new DesignBook("nth-demo");
  const space = book.addScope("space");
  for (const [k, n] of SCALE) space.set(k, px(n));
  const ui = book.addScope("ui");

  // The slider is a relative position, 0 to 1; at its right end the call is
  // -1 (the last member), since nth(1) is the integer 1, the second member.
  function render () {
    const v = Number(indexEl.value);
    const n = v >= 1 ? -1 : v;
    ui.set("pick", nth(ref("space"), n));
    const value = book.resolve("ui.pick");
    const picked = SCALE.findIndex(([, px]) => `${px}px` === value);
    rows.innerHTML = SCALE.map(([k, px], i) => `
      <tr class="${i === picked ? "is-pick" : ""}"><td class="no">${i}</td><td class="no">${i - SCALE.length}</td><td>space.${k}</td><td>${px}px</td></tr>`).join("");
    if (readout) readout.innerHTML = `<span class="c-fn">nth</span>(space, <b>${n}</b>) → <b>space.${SCALE[picked][0]}</b> · ${value}`;
  }

  indexEl.addEventListener("input", render);
  render();
})();

// — nth, modes: one ramp, the roles at positions on it; dark mode is the
//   ramp written the other way round —
(function demoNthModes () {
  const rampEl = document.getElementById("nm-ramp");
  const card = document.getElementById("nm-card");
  const sw = document.getElementById("nm-switch");
  if (!rampEl || !card || !sw) return;
  const RAMP = ["#eee9dc", "#d5cdb5", "#beb497", "#9c907a", "#766b5b", "#564f44", "#3a342c", "#0d0a03"];
  const ROLES = { bg: 0, border: 0.15, muted: 0.6, text: -1 };

  function render (mode) {
    const book = new DesignBook(mode);
    const scale = book.addScope("scale");
    const steps = mode === "dark" ? [...RAMP].reverse() : RAMP;
    steps.forEach((c, i) => scale.set(`s${i}`, color(c)));
    const ui = book.addScope("ui");
    for (const [role, n] of Object.entries(ROLES)) ui.set(role, nth(ref("scale"), n));
    const v = Object.fromEntries(Object.keys(ROLES).map((r) => [r, book.resolve(`ui.${r}`)]));
    for (const [role, value] of Object.entries(v)) card.style.setProperty(`--nm-${role}`, value);
    // the ramp in the order it is written, each role under its position
    rampEl.innerHTML = steps.map((c) => {
      const roles = Object.keys(v).filter((r) => v[r].toLowerCase() === c.toLowerCase());
      return `<span style="background:${c}"><b>${roles.join(" ")}</b></span>`;
    }).join("");
    sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }
  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) render(b.dataset.mode);
  });
  render("light");
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
      return `<button type="button" class="stile ${cls}" data-key="${k}" style="background:${v}"
        title="gray.${k} · ${v}" aria-label="gray.${k}" aria-pressed="${k === anchor}"></button>`;
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

// — sibling, sizes: the same steps along a spacing scale, as a table —
(function demoSiblingSizes () {
  const rows = document.getElementById("sib-rows");
  const offsets = document.getElementById("sib-offsets");
  const wrapEl = document.getElementById("sib-wrap");
  if (!rows || !offsets || !wrapEl) return;

  // the keys from a naming scheme: smallest to largest creature
  const VALUES = [2, 4, 8, 12, 16, 24, 32, 48, 64];
  const SCALE = scaleNames(VALUES.length, "creatures").map((k, i) => [k, VALUES[i]]);
  let anchor = SCALE[4][0];
  let offset = 1;
  const book = new DesignBook("sibling-sizes");
  const space = book.addScope("space");
  for (const [k, n] of SCALE) space.set(k, px(n));
  const ui = book.addScope("ui");

  function render () {
    let result = null;
    try {
      ui.set("pick", sibling(ref(`space.${anchor}`), offset, { wrap: wrapEl.checked }));
      result = book.resolve("ui.pick");
    } catch { /* off the end of the scale */ }
    const pickKey = SCALE.find(([k, n]) => `${n}px` === result && k !== anchor)?.[0];
    rows.innerHTML = SCALE.map(([k, n], i) => {
      const cls = k === anchor ? "is-anchor" : k === pickKey ? "is-pick" : "";
      const note = k === anchor ? "anchor" : k === pickKey ? `sibling ${offset > 0 ? "+" : "−"}${Math.abs(offset)}` : "";
      return `<tr class="${cls}" data-key="${k}" tabindex="0"><td class="no">${i}</td><td>space.${k}</td><td>${n}px</td><td>${note}</td></tr>`;
    }).join("");
  }
  const move = (tr) => { if (tr) { anchor = tr.dataset.key; render(); } };
  rows.addEventListener("click", (e) => move(e.target.closest("tr[data-key]")));
  rows.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); move(e.target.closest("tr[data-key]")); }
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
  const modesEl = document.getElementById("order-modes");
  const host    = document.getElementById("order-swatches");
  if (!modesEl || !host) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A mixed scope: colors off the seed (lightness, chroma and hue all
  // differ, so a perceptual sort and a lightness sort disagree), sizes and
  // words, inserted scrambled, with names in no useful order.
  // colors: [name, L, C, hueOffset]
  const COLORS = [
    ["orchid", 0.62, 0.16, "+330"], ["teal", 0.55, 0.10, "+190"],
    ["gold", 0.84, 0.15, "+85"],    ["ink", 0.25, 0.04, "+260"],
    ["coral", 0.70, 0.17, "+20"],   ["mist", 0.92, 0.03, "+220"],
  ];
  const SIZES = [["gap", 16], ["hair", 4], ["pad", 8]];
  const WORDS = [["face", "serif"], ["code", "mono"]];
  const ORDER = ["orchid", "gap", "teal", "face", "gold", "hair", "ink", "coral", "code", "mist", "pad"];

  // Two real books: one with the built-in orderers, one whose colors are
  // sorted by a custom orderer (OKLCH lightness alone).
  function makeBook (custom) {
    const book = new DesignBook("order-demo");
    if (custom) {
      book.registerOrderer("color", (entries) =>
        [...entries].sort((a, b) => (lch(a.resolved)?.l ?? 0) - (lch(b.resolved)?.l ?? 0)));
    }
    book.addScope("seed").set("primary", color("#de5331"));
    const ui = book.addScope("ui");
    for (const key of ORDER) {
      const c = COLORS.find(([n]) => n === key);
      const z = SIZES.find(([n]) => n === key);
      const w = WORDS.find(([n]) => n === key);
      if (c) ui.set(key, relativeTo(ref("seed.primary"), "oklch", [c[1], c[2], c[3]]));
      else if (z) ui.set(key, px(z[1]));
      else ui.set(key, string(w[1]));
    }
    return book;
  }
  const books = { builtin: makeBook(false), custom: makeBook(true) };

  const MODES = {
    "insertion":  ["builtin", null],
    "value-asc":  ["builtin", [{ by: "value", direction: "asc" }]],
    "value-desc": ["builtin", [{ by: "value", direction: "desc" }]],
    "name":       ["builtin", [{ by: "name" }]],
    "type":       ["builtin", [{ by: "type", priority: ["color", "dimension", "string"] }, { by: "value" }]],
    "lightness":  ["custom",  [{ by: "type", priority: ["color", "dimension", "string"] }, { by: "value" }]],
  };
  let mode = "value-asc";
  const current = () => books[MODES[mode][0]].getScope("ui");

  // One row per token, kept across reorders so they can FLIP-animate.
  const TYPE = (key) => COLORS.some(([n]) => n === key) ? "color"
    : SIZES.some(([n]) => n === key) ? "dimension" : "string";
  const tiles = new Map();
  for (const key of ORDER) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="no"></td><td>ui.${key}</td><td>${TYPE(key)}</td><td class="val"></td>`;
    tiles.set(key, tr);
    host.appendChild(tr);
  }

  function applyOrder () {
    const [which, order] = MODES[mode];
    const scope = books[which].getScope("ui");
    if (order) scope.setOrder(order); else scope.clearOrder();
  }

  function render () {
    const first = new Map();
    for (const [name, el] of tiles) first.set(name, el.getBoundingClientRect());
    const scope = current();
    scope.getAllKeys().forEach((name, i) => {
      const tr = tiles.get(name);
      if (!tr) return;
      const value = String(scope.resolve(name));
      tr.cells[0].textContent = i;
      tr.cells[3].innerHTML = TYPE(name) === "color"
        ? `<span class="swatch" style="background:${value}"></span>${value}` : value;
      host.appendChild(tr);
    });
    if (reduceMotion) return;
    for (const [name, el] of tiles) {
      const f = first.get(name);
      const dy = f.top - el.getBoundingClientRect().top;
      if (!dy) continue;
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
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
  const fromEl    = document.getElementById("ramp-from");
  if (!seedInput || !barsEl) return;

  const INITIAL_SEED = seedInput.getAttribute("value") || "#3c61a0";

  // The <color-input> custom element initialises its `.value` property
  // asynchronously after upgrade — read the `value` attribute as the
  // source of truth here, and assign the property so the element
  // reflects it on first paint.
  seedInput.value = INITIAL_SEED;

  // Tiny isolated book — keeps this demo independent of the hero book.
  // Tailwind v3 is built in; v4 and Radix come straight from dittotones.
  const rampBook = new DesignBook("ramp-demo");
  rampBook.registerRamps("tailwind-v4", tailwindRamps);
  rampBook.registerRamps("radix", radixRamps);
  const SHADES = {
    "tailwind-v3": ["50","100","200","300","400","500","600","700","800","900","950"],
    "tailwind-v4": ["50","100","200","300","400","500","600","700","800","900","950"],
    radix: ["1","2","3","4","5","6","7","8","9","10","11","12"],
  };
  const brand   = rampBook.addScope("brand");
  brand.set("primary", color(INITIAL_SEED));
  const palette = rampBook.addScope("palette");
  let shades = [];

  // One ramp token per shade of the chosen masters; a bar for each.
  function build (from) {
    for (const shade of shades) palette.delete(shade);
    shades = SHADES[from];
    for (const shade of shades) palette.set(shade, ramp(ref("brand.primary"), { shade, from }));
    barsEl.innerHTML = shades.map((shade) =>
      `<div class="ramp-bar" data-shade="${shade}"><span class="shade">${shade}</span><span class="hex"></span></div>`).join("");
  }

  function paint () {
    const seed = seedInput.value || INITIAL_SEED;
    try {
      brand.set("primary", color(seed));
    } catch {
      return; // bad input, leave the bars on their last good state
    }
    for (const shade of shades) {
      const stopHex = rampBook.resolve(`palette.${shade}`);
      const bar = barsEl.querySelector(`[data-shade="${shade}"]`);
      bar.style.background = stopHex;
      bar.querySelector(".hex").textContent = stopHex;
      const L = lch(stopHex)?.l ?? 0.5;
      bar.style.color = L > 0.6 ? "#0d0a03" : "#eee9dc";
    }
  }

  fromEl?.addEventListener("change", () => { build(fromEl.value); paint(); });
  seedInput.addEventListener("change", paint);
  seedInput.addEventListener("input", paint);
  build(fromEl?.value || "tailwind-v3");
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
//  extends — light and dark as two cards: dark overrides bg and text,
//  the buttons it inherits from light
// ══════════════════════════════════════════════════════════════════════
(function extendsCards () {
  const host = document.getElementById("extends-cards");
  if (!host) return;
  const book = new DesignBook("extends-demo");
  const light = book.addScope("light");
  light.set("bg", color("#fffaed"));
  light.set("text", color("#0d0a03"));
  light.set("primary", color("#3c61a0"));
  light.set("accent", color("#de5331"));
  light.set("muted", color("#908b7f"));
  const dark = book.addScope("dark", { extends: "light" });
  dark.set("bg", color("#0d0a03"));
  dark.set("text", color("#fffaed"));

  const onButton = (bg) => (contrast(bg, "#fffaed") >= contrast(bg, "#0d0a03") ? "#fffaed" : "#0d0a03");
  const chip = (bg) => `<span class="ui-card-button" style="background:${bg}"><span class="ui-card-line" style="background:${onButton(bg)}"></span></span>`;
  host.innerHTML = ["light", "dark"].map((name) => {
    const v = (k) => book.resolve(`${name}.${k}`);
    return `
    <div class="ref-card">
      <span class="ref-card-name">${name}</span>
      <div class="ui-card" aria-hidden="true" style="--card-surface:${v("bg")};--card-text:${v("text")};--card-subtle:${v("muted")}">
        <span class="ui-card-line ui-card-line--title"></span>
        <span class="ui-card-line"></span>
        <span class="ui-card-line ui-card-line--short"></span>
        <span class="ui-card-buttons">${chip(v("primary"))}${chip(v("accent"))}</span>
      </div>
    </div>`;
  }).join("");
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

  const BRAND = ["#de5331", "#dab43d", "#479549", "#3c61a0", "#0d0a03", "#fffaed"];
  const INITIAL = surfaceIn.getAttribute("value") || "#0d0a03";
  surfaceIn.value = INITIAL;
  let ratio = 4.5;

  // a result: the call on a row of its own, then the pick as text on the
  // surface, with its value and ratio
  const result = (call, surface, value, failMsg) => {
    const ink = contrast(surface, "#0d0a03") > 4.5 ? "#0d0a03" : "#eee9dc";
    return `<div class="rdx-row">
      <code class="rdx-call">${call}</code>
      <div class="rdx-sample${value ? "" : " is-fail"}" style="background:${surface}">
        ${value
          ? `<span class="rdx-text" style="color:${value}">Read the docs →</span>
             <span class="rdx-meta" style="color:${ink}">${value} · ${contrast(surface, value).toFixed(2)}:1</span>`
          : `<span class="rdx-meta" style="color:${ink}">${failMsg}</span>`}
      </div>
    </div>`;
  };

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

  const INITIAL = seedIn.getAttribute("value") || "#479549";
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
