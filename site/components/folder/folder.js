// Folders: papers stacked one behind the other, a tab on the top edge of
// each. Its tab, or any part of a paper behind that shows, brings a paper
// forward; the papers behind are inert. One listener serves every folder
// on the page. The folder announces the change as `sheetchange`
// (detail: { sheet, name }), so a page can draw a paper when it comes
// forward.

export function bringForward(folder, sheet) {
  for (const s of folder.querySelectorAll(":scope > .folder-sheet")) {
    const front = s === sheet;
    s.classList.toggle("is-front", front);
    s.querySelector(":scope > .folder-tab")?.setAttribute("aria-pressed", String(front));
    const body = s.querySelector(":scope > .folder-body");
    if (body) body.inert = !front;
  }
  folder.dispatchEvent(new CustomEvent("sheetchange", { detail: { sheet, name: sheet.dataset.sheet } }));
}

document.addEventListener("click", (event) => {
  const sheet = event.target.closest(".folder-tab")?.closest(".folder-sheet")
    ?? event.target.closest(".folder-sheet:not(.is-front)");
  const folder = sheet?.parentElement;
  if (!folder?.classList.contains("folder") || sheet.classList.contains("is-front")) return;
  bringForward(folder, sheet);
});

for (const body of document.querySelectorAll(".folder-sheet:not(.is-front) > .folder-body")) body.inert = true;

// A folder with [data-tab-row] sets its tabs side by side, each as wide as
// its name, in the order of its papers from front to back.
function rowTabs(folder) {
  let left = 0;
  for (const sheet of [...folder.querySelectorAll(":scope > .folder-sheet")].reverse()) {
    sheet.style.setProperty("--tab-left", `${left}px`);
    left += sheet.querySelector(":scope > .folder-tab").offsetWidth + 4;
  }
}
const rows = document.querySelectorAll(".folder[data-tab-row]");
if (rows.length) document.fonts.ready.then(() => rows.forEach(rowTabs));
