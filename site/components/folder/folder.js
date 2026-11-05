// Folders: papers stacked one behind the other, a tab for each. The tabs
// stand in one row on top of the folder (.folder-tabs, a flex row), each
// as wide as its name, so they never overlap; a tab, or any part of a
// paper behind that shows, brings that paper forward; the papers behind
// are inert. One listener serves every folder on the page. The folder
// announces the change as `sheetchange` (detail: { sheet, name }), so a
// page can draw a paper when it comes forward.
//
// In the markup each tab is the first child of its paper (Sheet.astro);
// this script moves it into the folder's tab row, in the order the page
// placed the tabs (--tab-left, else results first, code last), or front
// to back for a folder with [data-tab-row]. Each tab keeps its paper's
// colors.

const tabOf = new WeakMap();
const sheetOf = new WeakMap();

const sheetsOf = (folder) => [...folder.querySelectorAll(":scope > .folder-sheet")];

export function bringForward(folder, sheet) {
  for (const s of sheetsOf(folder)) {
    const front = s === sheet;
    s.classList.toggle("is-front", front);
    const tab = tabOf.get(s) ?? s.querySelector(":scope > .folder-tab");
    tab?.setAttribute("aria-pressed", String(front));
    tab?.classList.toggle("is-front", front);
    const body = s.querySelector(":scope > .folder-body");
    if (body) body.inert = !front;
  }
  folder.dispatchEvent(new CustomEvent("sheetchange", { detail: { sheet, name: sheet.dataset.sheet } }));
}

document.addEventListener("click", (event) => {
  const tab = event.target.closest(".folder-tab");
  const sheet = (tab && (sheetOf.get(tab) ?? tab.closest(".folder-sheet")))
    ?? event.target.closest(".folder-sheet:not(.is-front)");
  const folder = sheet?.parentElement;
  if (!folder?.classList.contains("folder") || sheet.classList.contains("is-front")) return;
  bringForward(folder, sheet);
});

for (const body of document.querySelectorAll(".folder-sheet:not(.is-front) > .folder-body")) body.inert = true;

// Moves a folder's tabs into one flex row, in the order the page laid
// them out (their offset along the edge), each carrying its paper's colors.
function rowTabs(folder) {
  if (folder.querySelector(":scope > .folder-tabs")) return;
  const sheets = sheetsOf(folder);
  const entries = sheets
    .map((sheet, i) => ({ sheet, i, tab: sheet.querySelector(":scope > .folder-tab") }))
    .filter((e) => e.tab);
  if (entries.length === 0) return;
  if (folder.hasAttribute("data-tab-row")) {
    entries.reverse(); // front to back
  } else {
    entries.sort((a, b) => a.tab.offsetLeft - b.tab.offsetLeft || a.i - b.i);
  }
  const bar = document.createElement("div");
  bar.className = "folder-tabs";
  for (const { sheet, tab } of entries) {
    const style = getComputedStyle(sheet);
    tab.style.setProperty("--pp", style.getPropertyValue("--pp"));
    tab.style.setProperty("--pp-text", style.getPropertyValue("--pp-text"));
    tab.classList.toggle("is-front", sheet.classList.contains("is-front"));
    tabOf.set(sheet, tab);
    sheetOf.set(tab, sheet);
    bar.append(tab);
  }
  folder.prepend(bar);
  folder.classList.add("has-tab-row");
}

for (const folder of document.querySelectorAll(".folder")) rowTabs(folder);
