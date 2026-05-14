import { getStored, setStored } from "./stored-state";

const wrapperEl = document.querySelector<HTMLElement>("[data-schedule-wrapper]");
if (!wrapperEl) throw new Error("Missing schedule wrapper");
const wrapper: HTMLElement = wrapperEl;

const slug = wrapper.dataset.scheduleSlug ?? "";
const freeKey = `${slug}:free`;
const quebecKey = `${slug}:quebec`;
const startKey = `${slug}:start`;
const typeKey = `${slug}:type`;

let sortByStart = getStored<boolean>(startKey, false);

function transition(fn: () => void) {
  if (document.startViewTransition) document.startViewTransition(fn);
  else fn();
}

wrapper.querySelector("[data-filter-bar]")?.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-filter], [data-filter-type]");
  if (!btn) return;
  const f = btn.dataset.filter;
  const s = btn.dataset.filterType;
  transition(() => {
    if (f === "all") {
      wrapper.removeAttribute("data-filter-free");
      wrapper.removeAttribute("data-filter-quebec");
      wrapper.removeAttribute("data-filter-type");
      setStored(freeKey, false);
      setStored(quebecKey, false);
      setStored(typeKey, null);
    } else if (f === "free") {
      const next = !wrapper.hasAttribute("data-filter-free");
      wrapper.toggleAttribute("data-filter-free", next);
      setStored(freeKey, next);
    } else if (f === "quebec") {
      const next = !wrapper.hasAttribute("data-filter-quebec");
      wrapper.toggleAttribute("data-filter-quebec", next);
      setStored(quebecKey, next);
    } else if (s) {
      const current = wrapper.getAttribute("data-filter-type");
      if (current === s) {
        wrapper.removeAttribute("data-filter-type");
        setStored(typeKey, null);
      } else {
        wrapper.setAttribute("data-filter-type", s);
        setStored(typeKey, s);
      }
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

if (sortByStart) {
  wrapper.setAttribute("data-sort-pending", "");
  requestAnimationFrame(() => {
    applySortOrder();
    const { hash } = window.location;
    if (hash) {
      try {
        const el = document.querySelector(hash);
        if (el?.matches("[data-row]")) {
          el.scrollIntoView({ block: "start", behavior: "instant" });
        }
      } catch (_) {}
    }
    wrapper.removeAttribute("data-sort-pending");
  });
}
