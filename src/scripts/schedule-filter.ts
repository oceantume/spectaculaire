import { getStored, setStored } from "./stored-state";

const wrapperEl = document.querySelector<HTMLElement>("[data-schedule-wrapper]");
if (!wrapperEl) throw new Error("Missing schedule wrapper");
const wrapper: HTMLElement = wrapperEl;

const slug = wrapper.dataset.scheduleSlug ?? "";
const freeKey = `${slug}:free`;
const quebecKey = `${slug}:quebec`;
const startKey = `${slug}:start`;

let sortByStart = getStored<boolean>(startKey, false);

function transition(fn: () => void) {
  if (document.startViewTransition) document.startViewTransition(fn);
  else fn();
}

wrapper.querySelector("[data-filter-bar]")?.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-filter]");
  if (!btn) return;
  const f = btn.dataset.filter;
  transition(() => {
    if (f === "all") {
      wrapper.removeAttribute("data-filter-free");
      wrapper.removeAttribute("data-filter-quebec");
      setStored(freeKey, false);
      setStored(quebecKey, false);
    } else if (f === "free") {
      const next = !wrapper.hasAttribute("data-filter-free");
      wrapper.toggleAttribute("data-filter-free", next);
      setStored(freeKey, next);
    } else if (f === "quebec") {
      const next = !wrapper.hasAttribute("data-filter-quebec");
      wrapper.toggleAttribute("data-filter-quebec", next);
      setStored(quebecKey, next);
    }
  });
});

function applySortOrder() {
  for (const tbody of wrapper.querySelectorAll<HTMLElement>("tbody[data-day]")) {
    const date = tbody.dataset.day;
    const rows = Array.from(tbody.querySelectorAll<HTMLElement>(`[data-row][data-date="${date}"]`));
    rows.sort(
      sortByStart
        ? (a, b) => (a.dataset.time ?? "").localeCompare(b.dataset.time ?? "")
        : (a, b) => Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex),
    );
    for (const row of rows) tbody.appendChild(row);
  }
  wrapper.toggleAttribute("data-sort-by-start", sortByStart);
}

wrapper.querySelector("[data-sort-toggle]")?.addEventListener("click", () => {
  sortByStart = !sortByStart;
  setStored(startKey, sortByStart);
  transition(() => applySortOrder());
});

requestAnimationFrame(() => transition(() => applySortOrder()));
