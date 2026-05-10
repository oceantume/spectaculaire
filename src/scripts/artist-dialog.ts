import type { ArtistDetailsByName } from "../types";
import { getYouTubeEmbed } from "./youtube";

const dialogEl = document.querySelector<HTMLDialogElement>("#artist-dialog");
const dialogContentEl = document.querySelector<HTMLElement>("#artist-dialog-content");
const dataEl = document.querySelector<HTMLScriptElement>("#artist-details-data");

if (!dialogEl || !dialogContentEl || !dataEl) throw new Error("Missing dialog elements");

const artistDetails: ArtistDetailsByName = JSON.parse(dataEl.textContent ?? "{}");

// Capture non-null references for use in functions
const dialog = dialogEl;
const dialogContent = dialogContentEl;

let currentArtistName: string | null = null;

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function renderDialogContent(name: string, country: string | undefined, genre: string) {
  const details = artistDetails[name];
  const links = details?.links ?? [];
  const officialVideoLink = links.find(
    (l) => l.label.toLowerCase().includes("vidéo") || l.label.toLowerCase().includes("video"),
  );
  const youtubeEmbed = officialVideoLink ? getYouTubeEmbed(officialVideoLink.url) : null;
  const remainingLinks = links.filter((l) => l !== officialVideoLink);

  let html = "";

  if (details?.imageUrl) {
    html += `<div class="relative">`;
    html += `<img src="${escapeAttr(details.imageUrl)}" alt="" class="w-full h-64 object-cover object-top rounded-t-xl" />`;
    html += `<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent rounded-t-xl"></div>`;
    html += `<div class="absolute bottom-0 left-0 p-4">`;
    html += `<h2 class="text-xl font-bold text-white">${escapeHtml(name)}</h2>`;
    if (country) html += `<p class="text-sm text-white/80">${escapeHtml(country)}</p>`;
    html += `</div>`;
    html += `<button type="button" data-dialog-close class="absolute top-3 right-3 text-white/80 hover:text-white text-2xl leading-none cursor-pointer" aria-label="Fermer">×</button>`;
    if (youtubeEmbed) {
      html += `<button type="button" data-play-video data-video-id="${escapeAttr(youtubeEmbed.videoId)}" data-video-start="${youtubeEmbed.start ?? ""}" data-video-url="${escapeAttr(officialVideoLink?.url ?? "")}" class="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer" aria-label="Jouer la vidéo officielle">`;
      html += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
      html += `</button>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="flex items-start justify-between gap-4 p-4 pb-2">`;
    html += `<div class="flex-1 min-w-0">`;
    html += `<h2 class="text-xl font-bold text-gray-900 dark:text-white">${escapeHtml(name)}</h2>`;
    if (country) html += `<p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(country)}</p>`;
    html += `</div>`;
    html += `<button type="button" data-dialog-close class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl leading-none flex-shrink-0 cursor-pointer" aria-label="Fermer">×</button>`;
    html += `</div>`;
  }

  html += `<div class="px-4 pt-3 pb-1">`;
  html += `<span class="text-xs font-medium px-2 py-1 rounded self-start bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">${escapeHtml(genre)}</span>`;
  html += `</div>`;

  if (details?.description) {
    html += `<p class="px-4 pb-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">${escapeHtml(details.description)}</p>`;
  }

  if (remainingLinks.length > 0) {
    html += `<div class="flex flex-wrap gap-2 px-4 pb-4">`;
    for (const link of remainingLinks) {
      html += `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">${escapeHtml(link.label)}</a>`;
    }
    html += `</div>`;
  }

  dialogContent.innerHTML = html;
}

function openArtistDialog(name: string, country: string | undefined, genre: string) {
  currentArtistName = name;
  renderDialogContent(name, country, genre);
  dialog.showModal();
  document.body.style.overflow = "hidden";
}

function closeArtistDialog() {
  dialog.close();
  currentArtistName = null;
  document.body.style.overflow = "";
}

function getVisibleRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("tr[data-row]")).filter((r) => !r.hidden);
}

function navigate(delta: -1 | 1) {
  if (!currentArtistName) return;
  const name = currentArtistName;
  const rows = getVisibleRows();
  const idx = rows.findIndex((r) => r.querySelector(`[data-artist-open="${CSS.escape(name)}"]`));
  if (idx === -1) return;
  const next = (idx + delta + rows.length) % rows.length;
  const nextRow = rows[next];
  const btn = nextRow.querySelector<HTMLElement>("[data-artist-open]");
  if (!btn) return;
  const nextName = btn.dataset.artistOpen ?? "";
  const nextCountry = nextRow.dataset.country;
  const nextGenre = nextRow.dataset.genre ?? "";
  renderDialogContent(nextName, nextCountry, nextGenre);
  currentArtistName = nextName;
}

document.addEventListener("click", (e) => {
  const target = e.target as Element;

  const openBtn = target.closest<HTMLElement>("[data-artist-open]");
  if (openBtn) {
    const row = openBtn.closest<HTMLElement>("tr[data-row]");
    const name = openBtn.dataset.artistOpen ?? "";
    const country = row?.dataset.country;
    const genre = row?.dataset.genre ?? "";
    openArtistDialog(name, country, genre);
    return;
  }

  if (target.closest("[data-dialog-close]")) {
    closeArtistDialog();
    return;
  }

  const playBtn = target.closest<HTMLElement>("[data-play-video]");
  if (playBtn) {
    const videoId = playBtn.dataset.videoId ?? "";
    const start = playBtn.dataset.videoStart;
    const startParam = start ? `&start=${start}` : "";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0${startParam}`;
    iframe.title = "Vidéo officielle";
    iframe.className = "w-full h-64 rounded-t-xl";
    iframe.allow = "autoplay; encrypted-media";
    iframe.allowFullscreen = true;
    playBtn.closest(".relative")?.replaceWith(iframe);
    return;
  }
});

dialog.addEventListener("click", (e) => {
  if (e.target === dialog) closeArtistDialog();
});

dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeArtistDialog();
});

dialog.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") {
    e.preventDefault();
    navigate(-1);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    navigate(1);
  }
});
