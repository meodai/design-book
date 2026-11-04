// The gutters of the docs and the article. Left: a map of the page, each
// section numbered where it sits (select one to go there), with a needle
// for where you are. Right: the edge of printer paper, a column of feed
// holes that runs past as the page scrolls.

const LOGO = `<svg class="logo" viewBox="0 0 32 27" aria-hidden="true"><path d="M16 6.5 C12.5 2.5 7.5 1.5 3.5 2.75 V19.25 C7.5 18 12.5 19 16 23" /><path d="M16 6.5 C19.5 2.5 24.5 1.5 28.5 2.75 V19.25 C24.5 18 19.5 19 16 23" /><path d="M2 5 V21.29 C7.45 19.59 11.81 20.49 16 25.28 C20.19 20.49 24.55 19.59 30 21.29 V5" /></svg>`;

const left = document.createElement("aside");
left.className = "rail rail-left";
left.setAttribute("aria-label", "Sections of this page");
const right = document.createElement("aside");
right.className = "rail rail-right";
right.setAttribute("aria-hidden", "true");
document.body.prepend(left, right);

// Which elements count as sections: the page can say so on <body>.
const sections = [...document.querySelectorAll(document.body.dataset.sections ?? "body > section")]
  .map((section, i) => {
    const heading = section.querySelector("h1, h2");
    if (!heading) return null;
    if (!section.id) section.id = heading.id ? `s-${heading.id}` : `section-${i + 1}`;
    return { section, title: heading.textContent.trim() };
  })
  .filter(Boolean);

function pageFraction(element) {
  const top = element.getBoundingClientRect().top + scrollY;
  const height = document.documentElement.scrollHeight - innerHeight;
  return height > 0 ? Math.min(1, Math.max(0, top / height)) : 0;
}

function build() {
  // The book at the foot of the rail, beside the bar's name; it leads
  // home like the name does.
  const home = document.querySelector("a.bar-brand")?.getAttribute("href") ?? "/";
  let l = `<span class="rail-legend">Sections, by position</span>` +
    `<a class="rail-mark" href="${home}" aria-label="Design Book, home">${LOGO}</a>` +
    `<div class="rail-scale">`;
  sections.forEach(({ section, title }, i) => {
    const y = pageFraction(section) * 100;
    l += `<i class="tick major" style="top:${y}%"></i>` +
      `<a class="num" href="#${section.id}" style="top:${y}%" title="${title.replace(/"/g, "&quot;")}">${i + 1}</a>`;
  });
  l += `<i class="needle" id="rail-here"></i></div>`;
  left.innerHTML = l;

  right.classList.add("rail-feed");
  follow();
}

function follow() {
  const height = document.documentElement.scrollHeight - innerHeight;
  const read = height > 0 ? scrollY / height : 0;
  const here = document.getElementById("rail-here");
  // The feed holes travel with the page.
  right.style.setProperty("--feed", `${-scrollY}px`);
  if (!here) return;
  // The section whose top has passed the middle of the window.
  let current = 0;
  sections.forEach(({ section }, i) => {
    if (section.getBoundingClientRect().top < innerHeight / 2) current = i;
  });
  here.style.top = `${read * 100}%`;
  here.dataset.label = String(current + 1);
}

addEventListener("scroll", follow, { passive: true });
addEventListener("resize", build);
addEventListener("load", build);
build();
