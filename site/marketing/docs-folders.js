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
const ROW = 28;
const snap = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    target.style.paddingBottom = "";
    const base = parseFloat(getComputedStyle(target).paddingBottom) || 0;
    const h = target.getBoundingClientRect().height;
    const extra = (ROW - (h % ROW)) % ROW;
    if (extra > 0.5) target.style.paddingBottom = `${base + extra}px`;
  }
});
for (const result of document.querySelectorAll(".folder-sheet--result .folder-body > *")) snap.observe(result);
