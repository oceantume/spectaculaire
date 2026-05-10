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
    html += `<div class="dialog-img-header">`;
    html += `<img src="${escapeAttr(details.imageUrl)}" alt="" class="dialog-cover-img" />`;
    html += `<div class="dialog-img-overlay"></div>`;
    html += `<div class="dialog-img-caption">`;
    html += `<h2 class="dialog-title-onimg">${escapeHtml(name)}</h2>`;
    if (country) html += `<p class="dialog-subtitle-onimg">${escapeHtml(country)}</p>`;
    html += `</div>`;
    html += `<button type="button" data-dialog-close class="dialog-close-onimg" aria-label="Fermer">×</button>`;
    if (youtubeEmbed) {
      html += `<button type="button" data-play-video data-video-id="${escapeAttr(youtubeEmbed.videoId)}" data-video-start="${youtubeEmbed.start ?? ""}" data-video-url="${escapeAttr(officialVideoLink?.url ?? "")}" class="dialog-play-btn" aria-label="Jouer la vidéo officielle">`;
      html += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="dialog-play-icon" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
      html += `</button>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="dialog-header">`;
    html += `<div class="dialog-header-main">`;
    html += `<h2 class="dialog-title">${escapeHtml(name)}</h2>`;
    if (country) html += `<p class="dialog-subtitle">${escapeHtml(country)}</p>`;
    html += `</div>`;
    html += `<button type="button" data-dialog-close class="dialog-close" aria-label="Fermer">×</button>`;
    html += `</div>`;
  }

  html += `<div class="dialog-genre-wrap">`;
  html += `<span class="dialog-genre-badge">${escapeHtml(genre)}</span>`;
  html += `</div>`;

  if (details?.description) {
    html += `<p class="dialog-description">${escapeHtml(details.description)}</p>`;
  }

  if (remainingLinks.length > 0) {
    html += `<div class="dialog-links">`;
    for (const link of remainingLinks) {
      html += `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" class="dialog-link">${escapeHtml(link.label)}</a>`;
    }
    html += `</div>`;
  }

  dialogContent.innerHTML = html;
}

function withDialogTransition(fn: () => void) {
  if (!document.startViewTransition) {
    fn();
    return;
  }
  dialog.classList.add("dialog-animating");
  document.documentElement.classList.add("dialog-transitioning");
  const t = document.startViewTransition(fn);
  t.finished.finally(() => {
    dialog.classList.remove("dialog-animating");
    document.documentElement.classList.remove("dialog-transitioning");
  });
}

function openArtistDialog(name: string, country: string | undefined, genre: string) {
  currentArtistName = name;
  renderDialogContent(name, country, genre);
  withDialogTransition(() => {
    dialog.showModal();
    document.body.style.overflow = "hidden";
  });
}

function closeArtistDialog() {
  withDialogTransition(() => {
    dialog.close();
    dialogContent.innerHTML = "";
    currentArtistName = null;
    document.body.style.overflow = "";
  });
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
  currentArtistName = nextName;
  if (document.startViewTransition) {
    document.startViewTransition(() => renderDialogContent(nextName, nextCountry, nextGenre));
  } else {
    renderDialogContent(nextName, nextCountry, nextGenre);
  }
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
    iframe.className = "dialog-video";
    iframe.allow = "autoplay; encrypted-media";
    iframe.allowFullscreen = true;
    playBtn.closest(".dialog-img-header")?.replaceWith(iframe);
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
