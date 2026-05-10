import { getStored, setStored } from "./stored-state";

const ACTIVE_ALL = "bg-gray-800 text-white border-gray-800 dark:bg-gray-500 dark:text-white dark:border-gray-500";
const INACTIVE =
  "text-gray-600 border-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-800";
const ACTIVE_FREE =
  "bg-green-100 text-green-900 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700";
const ACTIVE_QUEBEC =
  "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700";

function setButtonClasses(btn: Element | null, activeClass: string, isActive: boolean) {
  if (!btn) return;
  if (isActive) {
    for (const cls of INACTIVE.split(" ")) btn.classList.remove(cls);
    for (const cls of activeClass.split(" ")) btn.classList.add(cls);
  } else {
    for (const cls of activeClass.split(" ")) btn.classList.remove(cls);
    for (const cls of ACTIVE_ALL.split(" ")) btn.classList.remove(cls);
    for (const cls of ACTIVE_FREE.split(" ")) btn.classList.remove(cls);
    for (const cls of ACTIVE_QUEBEC.split(" ")) btn.classList.remove(cls);
    for (const cls of INACTIVE.split(" ")) btn.classList.add(cls);
  }
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
  setButtonClasses(scheduleFilterBar.querySelector("[data-filter='all']"), ACTIVE_ALL, allNone);
  setButtonClasses(scheduleFilterBar.querySelector("[data-filter='free']"), ACTIVE_FREE, showFreeOnly);
  setButtonClasses(scheduleFilterBar.querySelector("[data-filter='quebec']"), ACTIVE_QUEBEC, showQuebecOnly);

  // Update sort label
  const sortLabel = scheduleTable.querySelector<HTMLElement>("[data-sort-label]");
  if (sortLabel) {
    if (sortByStart) {
      sortLabel.classList.add("underline", "text-gray-900", "dark:text-white");
    } else {
      sortLabel.classList.remove("underline", "text-gray-900", "dark:text-white");
    }
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
  applyFilters();
});

function applySortOrderAnimated() {
  if (document.startViewTransition) {
    document.startViewTransition(() => applySortOrder());
  } else {
    applySortOrder();
  }
}

scheduleTable.querySelector("[data-sort-toggle]")?.addEventListener("click", () => {
  sortByStart = !sortByStart;
  setStored(startKey, sortByStart);
  applySortOrderAnimated();
  applyFilters();
});

applySortOrder();
applyFilters();
