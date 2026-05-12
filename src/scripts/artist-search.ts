import { html } from "./html";

type SearchIndex = {
  festivals: [slug: string, name: string][];
  venues: string[];
  entries: [artist: string, festivalIdx: number, date: string, time: string, venueIdx: number, rowIdx: number][];
};

type SearchEntry = {
  artist: string;
  normalizedArtist: string;
  festivalSlug: string;
  festivalName: string;
  date: string;
  time: string;
  venue: string;
  rowIdx: number;
};

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-CA", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

const input = document.getElementById("search-input") as HTMLInputElement;
const results = document.getElementById("search-results") as HTMLUListElement;
const statusEl = document.getElementById("search-status") as HTMLParagraphElement;

let debounceTimer: ReturnType<typeof setTimeout>;

const indexPromise: Promise<SearchEntry[]> = fetch("/search-index.json")
  .then((r) => r.json())
  .then(({ festivals, venues, entries }: SearchIndex) =>
    entries.map(([artist, fi, date, time, vi, rowIdx]) => ({
      artist,
      normalizedArtist: normalize(artist),
      festivalSlug: festivals[fi][0],
      festivalName: festivals[fi][1],
      date,
      time,
      venue: venues[vi],
      rowIdx,
    })),
  );

async function renderResults(query: string) {
  const q = normalize(query.trim());
  if (!q) {
    results.innerHTML = "";
    statusEl.textContent = "";
    return;
  }

  const index = await indexPromise;
  const matches = index.filter((e) => e.normalizedArtist.includes(q));

  if (matches.length === 0) {
    results.innerHTML = "";
    statusEl.textContent = "Aucun résultat.";
    return;
  }

  const maxResults = 100;
  const displayed = matches.slice(0, maxResults);
  const extra = matches.length - displayed.length;
  statusEl.textContent =
    extra > 0
      ? `${displayed.length} résultats affichés sur ${matches.length}`
      : `${matches.length} résultat${matches.length > 1 ? "s" : ""}`;
  results.innerHTML = html`${displayed.map(
    (e) => html`
      <li class="search-result-item">
        <a href="/${e.festivalSlug}#show-${e.rowIdx}" class="search-result-link">
          <span class="search-result-artist">${e.artist}</span>
          <span class="search-result-meta">
            <span class="search-result-festival">${e.festivalName}</span>
            <span class="search-result-sep" aria-hidden="true">·</span>
            <span class="search-result-date">${formatDate(e.date)}</span>
            <span class="search-result-sep" aria-hidden="true">·</span>
            <span class="search-result-venue">${e.venue}</span>
          </span>
        </a>
      </li>
    `,
  )}`.value;
}

input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => renderResults(input.value), 150);
});

if (input.value) renderResults(input.value);
