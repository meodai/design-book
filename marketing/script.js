// ════════════════════════════════════════════════════════════════════
// Design Book — Marketing page
// ════════════════════════════════════════════════════════════════════

import {
  parse,
  formatHex,
  converter,
  wcagContrast,
  interpolate,
} from "https://esm.sh/culori@4?bundle";

import "hdr-color-input";

// Default every <color-input> on the page (declarative + dynamically created)
// to open its picker in HSL while keeping hex as the surfaced value format.
// `initial-colorspace` only seeds the picker UI at upgrade time; subsequent
// reads from `.value` stay in whatever format the value attribute used.
{
  const applyHsl = (el) => {
    if (el.hasAttribute("initial-colorspace")) return;
    el.setAttribute("initial-colorspace", "hsl");
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
  bestContrastWith,
  minContrastWith,
  closestColor,
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
} from "../src/index";

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

/** Index of `hex` in `values`, comparing as colours. */
function indexOfColor (values, hex) {
  if (!hex) return -1;
  const want = formatHex(parse(hex));
  return values.findIndex((v) => formatHex(parse(v)) === want);
}

// ── Shared palettes for plates ─────────────────────────────────────
const PALETTE_BRAND = [
  "#14110d", "#c8391a", "#d49623", "#4f6033",
  "#1c3a9a", "#7a3c8e", "#dcd2b8", "#1d6b6a",
];
const PALETTE_CONTRAST_SURFACES = [
  "#14110d", "#ece5d3", "#c8391a", "#1c3a9a", "#4f6033", "#d49623",
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
    "#c8391a", "#d49623", "#4f6033", "#1c3a9a",
    "#7a3c8e", "#dcd2b8", "#1d6b6a", "#14110d",
    "#e85b3e", "#3b6dd3", "#2f8a7a", "#a04a8e",
  ];
  const INITIAL_CENTER = centerEl.getAttribute("value") || "#1d1c1c";
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

  // Every option runs the real selector over the ring. `furthestFrom` and
  // the vivid/lightness ones ignore the centre — they rank the ring itself.
  const selectors = {
    bestContrastWith: (s) => bestContrastWith(color(CENTER), s),
    minContrastWith:  (s) => minContrastWith(color(CENTER), s, { ratio: 3 }),
    closestColor:     (s) => closestColor(color(CENTER), s),
    furthestFrom:     (s) => furthestFrom(s),
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
  const INITIAL_BRAND = brandIn.getAttribute("value") || "#c8391a";
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
    });
    viz.innerHTML = renderer.render();
    // Renderers also feed the next section
    paintRenderers();
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
  try { w3.textContent   = book.render("w3-design-tokens"); }
  catch (e) { w3.textContent  = `// ${e.message}`; }
  try { tw.textContent   = book.render("tailwind"); }
  catch (e) { tw.textContent  = `// ${e.message}`; }
}

// Tabs
document.querySelectorAll(".r-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".r-tab").forEach((b) => b.classList.remove("is-active"));
    document.querySelectorAll(".r-pane").forEach((p) => p.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.getElementById(btn.dataset.target)?.classList.add("is-active");
  });
});

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
    strip.innerHTML = `<span style="background:#c8391a;grid-column:1/-1">poline error: ${e.message}</span>`;
    return;
  }

  strip.innerHTML = cssColors
    .map((c) => `<span style="background:${c}"></span>`)
    .join("");

  // Convert poline css colors (hsl strings) to hex and let the library pick.
  const hexes = cssColors.map((c) => hex(parse(c))).filter(Boolean);
  const surface = book.getScope("ui").resolve("surface");
  const border = pick(hexes, (s) => minContrastWith(color(surface), s, { ratio: 3 }));
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

// — bestContrastWith —
(function demoContrast () {
  const row = document.getElementById("demo-contrast");
  const pal = document.getElementById("demo-contrast-palette");
  if (!row) return;

  const wcagBadge = (ratio) => {
    if (ratio >= 7)   return { label: "AAA",  cls: "is-aaa"  };
    if (ratio >= 4.5) return { label: "AA",   cls: "is-aa"   };
    if (ratio >= 3)   return { label: "AA·LG", cls: "is-aalg" };
    return                  { label: "fails", cls: "is-fail" };
  };
  row.innerHTML = PALETTE_CONTRAST_SURFACES.map((surface) => {
    const text = pick(PALETTE_BRAND, (s) => bestContrastWith(color(surface), s));
    const ratio = contrast(surface, text);
    const badge = wcagBadge(ratio);
    return `
      <div class="contrast-tile" style="background:${surface};color:${text}">
        <span class="ctop">surface ${surface}</span>
        <span class="cbig">Aa</span>
        <span class="cbadge ${badge.cls}">${badge.label}</span>
        <span class="cbottom">${text} · ${ratio.toFixed(1)}:1</span>
      </div>`;
  }).join("");

  pal.innerHTML = PALETTE_BRAND.map((c) => `<span style="background:${c}" title="${c}"></span>`).join("");
})();

// — closestColor with picker —
(function demoClosest () {
  const swatchHost = document.getElementById("closest-target-swatch");
  const stage = document.getElementById("closest-ranked");
  if (!swatchHost || !stage) return;

  const picker = document.createElement("color-input");
  picker.setAttribute("initial-colorspace", "hsl");
  picker.setAttribute("value", "#7f4dc4");
  picker.setAttribute("no-alpha", "");
  picker.className = "closest-picker";
  swatchHost.replaceWith(picker);
  picker.id = "closest-target-swatch";

  function render (target) {
    // The winner is the library's answer; the rest are ordered by the same
    // OKLab distance so the ranking reads left to right.
    const winner = pick(PALETTE_BRAND, (s) => closestColor(color(target), s));
    const ranked = PALETTE_BRAND
      .map((c) => ({ color: c, d: deltaE(target, c) }))
      .sort((a, b) => (a.color === winner ? -1 : b.color === winner ? 1 : a.d - b.d))
      .slice(0, 7);
    stage.innerHTML = ranked.map((r, i) => `
      <div class="rank${r.color === winner ? " winner" : ""}" style="background:${r.color}" title="ΔE ${r.d.toFixed(3)}">
        <span class="num">${i + 1}</span><span>${r.color}</span>
      </div>`).join("");
  }
  picker.addEventListener("change", () => { if (picker.value) render(picker.value); });
  render(picker.getAttribute("value"));
})();

// — furthestFrom: the odd one out; click to exclude —
(function demoFurthest () {
  const stage = document.getElementById("furthest-stage");
  const readout = document.getElementById("furthest-readout");
  if (!stage) return;
  const palette = PALETTE_BRAND.slice(0, 7);
  const excluded = new Set();

  function render () {
    const pool = palette.filter((c) => !excluded.has(c));
    const far = pool.length ? pick(pool, (s) => furthestFrom(s)) : null;
    stage.innerHTML = palette.map((c) => {
      const cls = [];
      if (excluded.has(c)) cls.push("excluded");
      if (c === far)       cls.push("furthest");
      return `<button type="button" class="swatch-fr ${cls.join(" ")}" data-c="${c}" style="background:${c}"
        aria-pressed="${excluded.has(c)}" aria-label="${excluded.has(c) ? "Include" : "Exclude"} ${c}">
        <span class="hex">${c}</span></button>`;
    }).join("");
    const notList = [...excluded].map((c) => `<b>${c}</b>`).join(" ") || "—";
    readout.innerHTML = `<span>odd one out <b>${far ?? "none"}</b></span><span>not ${notList}</span>`;
  }
  stage.addEventListener("click", (e) => {
    const el = e.target.closest(".swatch-fr");
    if (!el) return;
    const c = el.dataset.c;
    if (excluded.has(c)) excluded.delete(c);
    else if (excluded.size < palette.length - 1) excluded.add(c);
    render();
  });
  render();
})();

// — minContrastWith —
(function demoMin () {
  const surface = "#ece5d3";
  const ramp = ["#ece5d3", "#d5cdb5", "#beb497", "#9c907a", "#766b5b", "#564f44", "#3a342c", "#14110d"];
  function paint (id, ratio) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = pick(ramp, (s) => minContrastWith(color(surface), s, { ratio }));
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
  const palette = ["#c8391a","#d49623","#1c3a9a","#4f6033","#7a3c8e","#dcd2b8","#1d6b6a","#14110d"];
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
  const palette = ["#c8391a","#d49623","#1c3a9a","#dcd2b8","#4f6033","#f3ead8","#7a3c8e","#14110d"];
  const SURFACE = "#fcf6ee";

  function render () {
    const opts = toggle.checked ? { readableOn: color(SURFACE), minContrast: 4.5 } : undefined;
    const hi = pick(palette, (s) => lightest(s, opts));
    const lo = pick(palette, (s) => darkest(s, opts));
    stage.innerHTML = palette.map((c) => {
      const readable = contrast(SURFACE, c) >= 4.5;
      const cls = [c === hi ? "is-lightest" : "", c === lo ? "is-darkest" : "",
                   toggle.checked && !readable ? "is-filtered" : ""].join(" ");
      const L = lch(c).l;
      return `<div class="ltile ${cls}" style="background:${c};color:${L > 0.6 ? "#1d1c1c" : "#fcf6ee"}">
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
  const palette = ["#c8391a","#d49623","#1c3a9a","#4f6033","#7a3c8e","#dcd2b8","#1d6b6a","#14110d"];

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
    "#faf3eb", "#ecd7b8", "#d4ab7a",
    "#b88042", "#96612b", "#744a1f",
    "#533417", "#352112", "#1a110a",
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
    ["g50", "#faf7f2"], ["g100", "#efe9df"], ["g200", "#ddd4c6"], ["g300", "#c4b8a6"],
    ["g500", "#8f8372"], ["g700", "#5b5246"], ["g900", "#2a251f"],
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
      return `<button type="button" class="stile ${cls}" data-key="${k}" style="background:${v};color:${L > 0.6 ? "#1d1c1c" : "#fcf6ee"}"
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
  seed.set("primary", color(seedEl.getAttribute("value") || "#c8391a"));
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

  const INITIAL_A = aIn.getAttribute("value") || "#c8391a";
  const INITIAL_B = bIn.getAttribute("value") || "#0066cc";
  aIn.value = INITIAL_A;
  bIn.value = INITIAL_B;

  const STOPS = 5;

  function paint () {
    const a = aIn.value || INITIAL_A;
    const b = bIn.value || INITIAL_B;
    const space = spaceS.value;
    let mixer;
    try {
      mixer = interpolate([a, b], space);
    } catch {
      mixer = interpolate([a, b], "lab");
    }
    const cells = [];
    for (let i = 0; i < STOPS; i++) {
      const t = i / (STOPS - 1);
      const hex = formatHex(mixer(t)) ?? a;
      cells.push(`<span style="background:${hex}" title="${hex}"></span>`);
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
  const INITIAL_SEED = seedInput.getAttribute("value") || "#0066cc";

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
      bar.style.color = L > 0.6 ? "#1a1a1a" : "#fcf6ee";
    }
  }

  seedInput.addEventListener("change", paint);
  seedInput.addEventListener("input", paint);
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
