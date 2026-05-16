// ════════════════════════════════════════════════════════════════════
// Design Book — Marketing page
// ════════════════════════════════════════════════════════════════════

import {
  parse,
  formatHex,
  converter,
  wcagContrast,
} from "https://esm.sh/culori@4?bundle";

import "hdr-color-input";

import {
  DesignBook,
  SVGRenderer,
  Renderer,
  color,
  ref,
  ramp,
} from "../src/index";

import { Poline } from "poline";

import { buildBook } from "./demo-book.js";

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

// ── Inline selector implementations (drive the small plates) ───────
// These mirror the library's selectors so the per-section demos stay
// self-contained. The big sections (graph, renderers, extend) use the
// real DesignBook directly.

function bestContrastWith (target, scope) {
  let best = null, bestR = -Infinity;
  for (const c of scope) { const r = contrast(target, c); if (r > bestR) { bestR = r; best = c; } }
  return { color: best, ratio: bestR };
}
function minContrastWith (target, scope, { threshold = 0 } = {}) {
  let best = null, bestR = Infinity;
  for (const c of scope) { const r = contrast(target, c); if (r >= threshold && r < bestR) { bestR = r; best = c; } }
  return { color: best, ratio: bestR };
}
function closestColor (target, scope) {
  return scope
    .map((c) => ({ color: c, d: deltaE(target, c) }))
    .sort((a, b) => a.d - b.d);
}
function furthestFrom (anchor, scope) {
  let best = null, bestD = -Infinity;
  for (const c of scope) { if (c === anchor) continue; const d = deltaE(anchor, c); if (d > bestD) { bestD = d; best = c; } }
  return { color: best, d: bestD };
}
function averageColor (scope) {
  let l = 0, a = 0, b = 0, n = 0;
  for (const c of scope) { const L = lab(c); l += L.l; a += L.a; b += L.b; n++; }
  return hex({ mode: "oklab", l: l / n, a: a / n, b: b / n });
}
function mostVivid (scope) {
  let best = null, bestC = -Infinity;
  for (const c of scope) { const C = lch(c).c; if (C > bestC) { bestC = C; best = c; } }
  return { color: best, chroma: bestC };
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
//  THE LIVE GRAPH — hero visual
// ══════════════════════════════════════════════════════════════════════
const book = buildBook();
let activeRamp = null;   // poline-generated ramp scope (populated below)

(function graphSection () {
  const viz       = document.getElementById("graph-viz");
  const brandIn   = document.getElementById("graph-brand");
  const surfaceIn = document.getElementById("graph-surface");
  const invert    = document.getElementById("graph-invert");
  if (!viz) return;

  // <color-input> sets its .value asynchronously after upgrade — seed
  // the property from the attribute so reads work on first paint.
  const INITIAL_BRAND   = brandIn.getAttribute("value")   || "#c8391a";
  const INITIAL_SURFACE = surfaceIn.getAttribute("value") || "#f5efe2";
  brandIn.value   = INITIAL_BRAND;
  surfaceIn.value = INITIAL_SURFACE;

  function paint () {
    const renderer = new SVGRenderer(book, {
      gap: 36,
      padding: 30,
      fontSize: 13,
      dotSize: 5,
      strokeWidth: 1.5,
    });
    viz.innerHTML = renderer.render();
    // Renderers also feed the next section
    paintRenderers();
  }

  function onBrandChange () {
    const v = brandIn.value || INITIAL_BRAND;
    try { book.getScope("values").set("vermilion", color(v)); paint(); } catch {}
  }
  function onSurfaceChange () {
    const v = surfaceIn.value || INITIAL_SURFACE;
    try { book.getScope("values").set("paper", color(v)); paint(); } catch {}
  }

  brandIn.addEventListener("change", onBrandChange);
  brandIn.addEventListener("input", onBrandChange);
  surfaceIn.addEventListener("change", onSurfaceChange);
  surfaceIn.addEventListener("input", onSurfaceChange);

  invert.addEventListener("click", () => {
    const current = book.getScope("ui").resolve("surface");
    const next = lch(current).l > 0.5 ? "#14110d" : "#f5efe2";
    book.getScope("values").set("paper", color(next));
    surfaceIn.value = next;
    paint();
  });

  paint();
})();

// ══════════════════════════════════════════════════════════════════════
//  RENDERER COMPARISON
// ══════════════════════════════════════════════════════════════════════
function tailwindRenderer (b) {
  const ui     = b.getScope("ui");
  const values = b.getScope("values");
  const colors = {};
  for (const k of values.getAllKeys()) colors[k] = values.resolve(k);
  for (const k of ui.getAllKeys()) {
    try { colors[`ui-${k}`] = ui.resolve(k); }
    catch { /* skip unresolvable */ }
  }
  return `module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 8).replace(/\n/g, "\n      ")}
    }
  }
};`;
}

function paintRenderers () {
  const css  = document.getElementById("r-css");
  const json = document.getElementById("r-json");
  const w3   = document.getElementById("r-w3");
  const tw   = document.getElementById("r-tailwind");
  if (!css) return;

  try { css.textContent  = new Renderer(book, "css-variables").render(); }
  catch (e) { css.textContent = `/* ${e.message} */`; }
  try { json.textContent = new Renderer(book, "json").render(); }
  catch (e) { json.textContent = `// ${e.message}`; }
  try { w3.textContent   = new Renderer(book, "w3-design-tokens").render(); }
  catch (e) { w3.textContent  = `// ${e.message}`; }
  try { tw.textContent   = tailwindRenderer(book); }
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
  // A small custom selector: the darkest member that still clears AA
  // against `against`. Not a registered function on the book — just a
  // self-contained illustration that mirrors the in-graph version.
  function darkestReadable (againstHex, scope, ratio = 4.5) {
    let best = null, bestL = 2;
    for (const c of scope) {
      if (contrast(againstHex, c) < ratio) continue;
      const L = lch(c).l;
      if (L < bestL) { bestL = L; best = c; }
    }
    return best;
  }

  const surface = book.getScope("ui").resolve("surface");
  const values  = [...book.getScope("values").getAllKeys()]
    .map((k) => book.getScope("values").resolve(k));
  const winner  = darkestReadable(surface, values, 4.5) ?? values[0];

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

  // Convert poline css colors (hsl strings) to hex for contrast math.
  const hexes = cssColors.map((c) => hex(parse(c))).filter(Boolean);
  const surface = book.getScope("ui").resolve("surface");
  const { color: pick } = minContrastWith(surface, hexes, { threshold: 1.5 });
  if (pick) {
    swatchOut.style.background = pick;
    hexOut.textContent = pick;
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

  row.innerHTML = PALETTE_CONTRAST_SURFACES.map((surface) => {
    const { color: text, ratio } = bestContrastWith(surface, PALETTE_BRAND);
    return `
      <div class="contrast-tile" style="background:${surface};color:${text}">
        <span class="ctop">surface ${surface}</span>
        <span class="cbig">Aa</span>
        <span class="cbottom">${text} · ${ratio.toFixed(1)}:1</span>
      </div>`;
  }).join("");

  pal.innerHTML = PALETTE_BRAND.map((c) => `<span style="background:${c}" title="${c}"></span>`).join("");
})();

// — closestColor with picker —
(function demoClosest () {
  const swatchHost = document.getElementById("closest-target-swatch");
  const hexEl = document.getElementById("closest-target-hex");
  const stage = document.getElementById("closest-ranked");

  const picker = document.createElement("color-input");
  picker.value = "#7f4dc4";
  picker.setAttribute("no-alpha", "");
  picker.className = "closest-picker";
  swatchHost.replaceWith(picker);
  picker.id = "closest-target-swatch";

  function render (target) {
    hexEl.textContent = target;
    const ranked = closestColor(target, PALETTE_BRAND).slice(0, 7);
    stage.innerHTML = ranked.map((r, i) => `
      <div class="rank${i === 0 ? " winner" : ""}" style="background:${r.color}" title="ΔE ${r.d.toFixed(3)}">
        <span class="num">${i + 1}</span><span>${r.color}</span>
      </div>`).join("");
  }
  picker.addEventListener("change", () => { if (picker.value) render(picker.value); });
  render(picker.value);
})();

// — furthestFrom —
(function demoFurthest () {
  const stage = document.getElementById("furthest-stage");
  const readout = document.getElementById("furthest-readout");
  if (!stage) return;
  const palette = PALETTE_BRAND.slice(0, 7);
  let anchor = palette[1];

  function render () {
    const { color: far, d } = furthestFrom(anchor, palette);
    stage.innerHTML = palette.map((c) => {
      const cls = [];
      if (c === anchor) cls.push("anchor");
      if (c === far)    cls.push("furthest");
      return `<div class="swatch-fr ${cls.join(" ")}" data-c="${c}" style="background:${c}">
        <span class="hex">${c}</span></div>`;
    }).join("");
    readout.innerHTML = `<span>anchor <b>${anchor}</b></span><span>furthest <b>${far}</b></span><span>ΔE <b>${d.toFixed(3)}</b></span>`;
    stage.querySelectorAll(".swatch-fr").forEach((el) => {
      el.addEventListener("mouseenter", () => { anchor = el.dataset.c; render(); });
    });
  }
  render();
})();

// — minContrastWith —
(function demoMin () {
  const surface = "#ece5d3";
  const ramp = ["#ece5d3", "#d5cdb5", "#beb497", "#9c907a", "#766b5b", "#564f44", "#3a342c", "#14110d"];
  function paint (id, threshold) {
    const el = document.getElementById(id);
    const { color, ratio } = minContrastWith(surface, ramp, { threshold });
    if (!color || !isFinite(ratio)) {
      el.classList.add("fail");
      el.style.background = surface;
      el.querySelector(".min-text").style.color = surface;
      el.querySelector(".min-text").textContent = "—";
      return;
    }
    el.style.background = surface;
    el.querySelector(".min-text").style.color = color;
    el.querySelector(".min-text").innerHTML =
      `Aa — Body, caption, label.<br>
       <span style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.04em;opacity:.75">${color} · ${ratio.toFixed(1)}:1</span>`;
  }
  paint("min-sample-3", 3); paint("min-sample-45", 4.5); paint("min-sample-7", 7);
})();

// — averageColor —
(function demoAverage () {
  const reroll = document.getElementById("reroll-avg");
  const inputsEl = document.getElementById("avg-inputs");
  const swatch = document.getElementById("avg-swatch");
  const hexEl = document.getElementById("avg-hex");
  const SETS = [
    ["#c8391a","#d49623","#1c3a9a","#4f6033","#7a3c8e","#1d6b6a"],
    ["#f2c14e","#f78154","#b4436c","#4d9078","#1d3557","#fef9ef"],
    ["#0b3954","#087e8b","#bfd7ea","#ff5a5f","#c81d25","#fff8f0"],
    ["#264653","#2a9d8f","#e9c46a","#f4a261","#e76f51","#dad7cd"],
    ["#003049","#d62828","#f77f00","#fcbf49","#eae2b7","#7fb069"],
  ];
  let idx = 0;
  function render () {
    const palette = SETS[idx % SETS.length];
    inputsEl.innerHTML = palette.map((c) => `<span style="background:${c}"></span>`).join("");
    const avg = averageColor(palette);
    swatch.style.background = avg;
    hexEl.textContent = avg;
  }
  render();
  reroll?.addEventListener("click", () => { idx++; render(); });
})();

// — nextLarger / nextSmaller —
function nextLargerLocal (target, scope, minD = 0) {
  let best = null;
  for (const v of scope) { if (v <= target + minD) continue; if (best === null || v < best) best = v; }
  return best;
}
function nextSmallerLocal (target, scope, minD = 0) {
  let best = null;
  for (const v of scope) { if (v >= target - minD) continue; if (best === null || v > best) best = v; }
  return best;
}
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

  function render () {
    const t = scale[Number(tSlider.value)];
    const md = Number(mSlider.value);
    tVal.textContent = `${t}px`; mVal.textContent = `${md}px`; targetOut.textContent = `${t}px`;
    const larger = nextLargerLocal(t, scale, md);
    const smaller = nextSmallerLocal(t, scale, md);
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

// — mostVivid —
(function demoVivid () {
  const stage = document.getElementById("vivid-stage");
  if (!stage) return;
  const palette = ["#c8391a","#d49623","#1c3a9a","#4f6033","#7a3c8e","#dcd2b8","#1d6b6a","#14110d"];
  const { color: crown } = mostVivid(palette);
  stage.innerHTML = palette.map((c) => {
    const C = lch(c).c || 0;
    return `<div class="vtile ${c === crown ? "crown" : ""}" style="background:${c}">
      <span class="chroma">${C.toFixed(2)}</span><span>${c}</span></div>`;
  }).join("");
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
