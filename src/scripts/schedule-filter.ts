import { getStored, setStored } from "./stored-state";

function setButtonActive(btn: Element | null, isActive: boolean) {
  if (!btn) return;
  btn.classList.toggle("is-active", isActive);
}

const table = document.querySelector<HTMLElement>("[data-schedule-table]");
const filterBar = document.querySelector<HTMLElement>("[data-filter-bar]");
if (!table || !filterBar) throw new Error("Missing schedule elements");

const slug = table.dataset.scheduleSlug ?? "";
const freeKey = `${slug}:free`;
const quebecKey = `${slug}:quebec`;
const startKey = `${slug}:start`;

let showFreeOnly = getStored(freeKey, false);
let showQuebecOnly = getStored(quebecKey, false);
let sortByStart = getStored(startKey, false);

// Capture non-null references for use in functions
const scheduleTable = table;
const scheduleFilterBar = filterBar;

function applyFilters() {
  const rows = scheduleTable.querySelectorAll<HTMLElement>("tr[data-row]");
  const dayHeaders = scheduleTable.querySelectorAll<HTMLElement>("tr[data-day-header]");
  const paidHeaders = scheduleTable.querySelectorAll<HTMLElement>("[data-paid-header]");
  const paidCells = scheduleTable.querySelectorAll<HTMLElement>("[data-paid-cell]");

  for (const row of rows) {
    const isPaid = row.dataset.paid === "true";
    const isQuebec = row.dataset.country === "Québec";
    row.hidden = (showFreeOnly && isPaid) || (showQuebecOnly && !isQuebec);
  }

  // Hide empty day headers
  for (const header of dayHeaders) {
    const date = header.dataset.date;
    const visibleRows = scheduleTable.querySelectorAll<HTMLElement>(`tr[data-row][data-date="${date}"]`);
    const anyVisible = Array.from(visibleRows).some((r) => !r.hidden);
    header.hidden = !anyVisible;
  }

  // Toggle paid column visibility
  for (const el of [...paidHeaders, ...paidCells]) {
    (el as HTMLElement).hidden = showFreeOnly;
  }

  // Update filter button states
  const allNone = !showFreeOnly && !showQuebecOnly;
  setButtonActive(scheduleFilterBar.querySelector("[data-filter='all']"), allNone);
  setButtonActive(scheduleFilterBar.querySelector("[data-filter='free']"), showFreeOnly);
  setButtonActive(scheduleFilterBar.querySelector("[data-filter='quebec']"), showQuebecOnly);

  // Update sort label
  const sortLabel = scheduleTable.querySelector<HTMLElement>("[data-sort-label]");
  if (sortLabel) {
    sortLabel.classList.toggle("is-active", sortByStart);
  }
}

function applySortOrder() {
  const tbody = scheduleTable.querySelector("tbody");
  if (!tbody) return;

  const dayHeaders = scheduleTable.querySelectorAll<HTMLElement>("tr[data-day-header]");
  for (const header of dayHeaders) {
    const date = header.dataset.date;
    const rows = Array.from(scheduleTable.querySelectorAll<HTMLElement>(`tr[data-row][data-date="${date}"]`));

    if (sortByStart) {
      rows.sort((a, b) => (a.dataset.time ?? "").localeCompare(b.dataset.time ?? ""));
    } else {
      rows.sort((a, b) => Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex));
    }

    for (const row of rows) {
      tbody.appendChild(row);
    }

    // Move day header before first row of its group
    if (rows[0]) {
      tbody.insertBefore(header, rows[0]);
    }
  }
}

scheduleFilterBar.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest("[data-filter]");
  if (!btn) return;
  const filter = (btn as HTMLElement).dataset.filter;
  if (filter === "all") {
    showFreeOnly = false;
    showQuebecOnly = false;
  } else if (filter === "free") {
    showFreeOnly = !showFreeOnly;
    if (showFreeOnly) showQuebecOnly = false;
  } else if (filter === "quebec") {
    showQuebecOnly = !showQuebecOnly;
    if (showQuebecOnly) showFreeOnly = false;
  }
  setStored(freeKey, showFreeOnly);
  setStored(quebecKey, showQuebecOnly);
  applyFiltersAnimated();
});

function applySortOrderAnimated() {
  if (document.startViewTransition) {
    document.startViewTransition(() => applySortOrder());
  } else {
    applySortOrder();
  }
}

function applyFiltersAnimated() {
  if (document.startViewTransition) {
    document.startViewTransition(() => applyFilters());
  } else {
    applyFilters();
  }
}

scheduleTable.querySelector("[data-sort-toggle]")?.addEventListener("click", () => {
  sortByStart = !sortByStart;
  setStored(startKey, sortByStart);
  applySortOrderAnimated();
  applyFiltersAnimated();
});

if (document.startViewTransition) {
  document.startViewTransition(() => {
    applySortOrder();
    applyFilters();
  });
} else {
  applySortOrder();
  applyFilters();
}
