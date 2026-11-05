// The tour's shared parts, marked after the page is drawn. (Its folders
// are <Folder>s in the markup; their switching is components/folder.)

// Code is printer paper: feed holes down its left edge (shared.css).
for (const code of document.querySelectorAll("pre.code, .r-pane")) code.classList.add("holes-left");

// Every group of choices is the shared switch.
for (const group of document.querySelectorAll(".names-schemes, .order-modes, .ref-modes, .extends-modes, .readable-ratios, .sibling-offsets, .nth-presets")) {
  group.classList.add("switch");
}

// Tables are the shared ledger: the rows of a scope, under its head; the
// value transforms as one numbered list. Some demos draw their tables
// again whenever their input changes, so new ones are marked as they
// appear.
function markLedgers(root = document) {
  for (const rows of root.querySelectorAll(".extends-rows:not([data-ledger])")) rows.setAttribute("data-ledger", "");
  for (const head of root.querySelectorAll(".extends-pane-head:not([data-ledger-head])")) head.setAttribute("data-ledger-head", "");
}
markLedgers();
document.querySelector(".coda-list")?.setAttribute("data-ledger", "");
new MutationObserver(() => markLedgers()).observe(document.body, { childList: true, subtree: true });

// A result is a whole number of rows tall, so its paper ends on a line.
// When it ends on a stub (its controls, docs.css), the stub starts on a
// rule (its perforation lies on one) and takes the extra at its bottom,
// so it still reaches the sheet's bottom edge; the result is told where
// the perforation is (--perf-y), to punch its holes there.
const ROW = 28;
const snap = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    // each part takes whole rows, so the next starts on a rule: what is
    // missing goes under it, outside its box (a box with a background
    // keeps its own size)
    if (target.tagName !== "P") {
      for (const part of target.children) {
        if (part.classList.contains("stub")) continue;
        part.style.marginBottom = "";
        const ph = part.getBoundingClientRect().height;
        const rest = ph % ROW;
        if (ph && rest > 0.5) part.style.marginBottom = `${ROW - rest}px`;
      }
    }
    const stub = target.lastElementChild?.classList.contains("stub") ? target.lastElementChild : null;
    if (stub) {
      // the stub starts on a rule, so its perforation lies on one
      stub.style.marginTop = "";
      const off = (stub.getBoundingClientRect().top - target.getBoundingClientRect().top) % ROW;
      if (off > 0.5) stub.style.marginTop = `${parseFloat(getComputedStyle(stub).marginTop) + ROW - off}px`;
      // where the perforation is, for the holes the result cuts on it
      const perf = stub.getBoundingClientRect().top - target.getBoundingClientRect().top + ROW - 0.5;
      target.style.setProperty("--perf-y", `${perf}px`);
    }
    const pad = stub ?? target;
    pad.style.paddingBottom = "";
    const base = parseFloat(getComputedStyle(pad).paddingBottom) || 0;
    const h = target.getBoundingClientRect().height;
    const extra = (ROW - (h % ROW)) % ROW;
    if (extra > 0.5) pad.style.paddingBottom = `${base + extra}px`;
  }
});
for (const result of document.querySelectorAll(".folder-sheet--result .folder-body > *")) snap.observe(result);
