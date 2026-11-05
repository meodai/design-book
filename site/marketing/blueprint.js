// For every .blueprint (shared.css):
// - numbers its cells across the top margin and letters them down the
//   left one: one label per cell, centered in the margin. The margin is
//   the box's padding and a cell two of it, as in the CSS. Redrawn when
//   the box changes size.
// - gives each table of the graph drawn in it (the SVG renderer's
//   .palette-table) a hatched shadow: a copy of its box, about 10px down
//   and to the right, filled with diagonal lines of one weight and
//   outlined, in a layer under the
//   connections, so only the boxes cast one. Added again whenever the
//   graph is drawn again.

function letter(i) {
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) {
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  }
  return s;
}

function label(box) {
  let layer = box.querySelector(":scope > .blueprint-labels");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "blueprint-labels";
    layer.setAttribute("aria-hidden", "true");
    box.prepend(layer);
  }
  const gutter = parseFloat(getComputedStyle(box).paddingTop) || 0;
  const cell = gutter * 2;
  if (!cell) return;
  const across = Math.floor((box.clientWidth - 2 * gutter) / cell);
  const down = Math.floor((box.clientHeight - 2 * gutter) / cell);
  const spans = [];
  for (let i = 0; i < across; i++) {
    spans.push(`<span style="left:${gutter + (i + 0.5) * cell}px;top:${gutter / 2}px">${i + 1}</span>`);
  }
  for (let j = 0; j < down; j++) {
    spans.push(`<span style="left:${gutter / 2}px;top:${gutter + (j + 0.5) * cell}px">${letter(j)}</span>`);
  }
  layer.innerHTML = spans.join("");
}

const SVG = "http://www.w3.org/2000/svg";
const SHADOW = 10; // offset, in screen pixels
let patterns = 0;

function shadow(svg) {
  if (svg.querySelector(":scope > .bp-shadows")) return;
  const tables = svg.querySelectorAll(".palette-table");
  if (!tables.length) return;
  const id = `bp-hatch-${++patterns}`;
  const defs = document.createElementNS(SVG, "defs");
  defs.innerHTML =
    `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line class="bp-hatch" x1="0" y1="0" x2="0" y2="4"/></pattern>`;
  // the drawing is scaled to its box: turn the offset into its units
  const shown = svg.getBoundingClientRect().width;
  const drawn = svg.viewBox.baseVal?.width || shown;
  const offset = shown ? (SHADOW * drawn) / shown : SHADOW;
  const layer = document.createElementNS(SVG, "g");
  layer.setAttribute("class", "bp-shadows");
  for (const table of tables) {
    const rect = document.createElementNS(SVG, "rect");
    for (const a of ["width", "height"]) {
      if (table.hasAttribute(a)) rect.setAttribute(a, table.getAttribute(a));
    }
    rect.setAttribute("x", +table.getAttribute("x") + offset);
    rect.setAttribute("y", +table.getAttribute("y") + offset);
    rect.setAttribute("fill", `url(#${id})`);
    layer.append(rect);
  }
  // first, so the connections and the tables are drawn over it
  svg.prepend(defs, layer);
}

function shadows(box) {
  box.querySelectorAll("svg").forEach(shadow);
}

const boxes = document.querySelectorAll(".blueprint");
if (boxes.length) {
  const resize = new ResizeObserver((entries) => entries.forEach((e) => label(e.target)));
  const redraw = new MutationObserver((records) => {
    new Set(records.map((r) => r.target.closest(".blueprint"))).forEach((box) => box && shadows(box));
  });
  boxes.forEach((box) => {
    resize.observe(box);
    shadows(box);
    redraw.observe(box, { childList: true, subtree: true });
  });
}
