import type { ArtistDetailsByName } from "../types";
import { enableBackdropDismiss } from "./dialog-backdrop";
import { html } from "./html";
import { getYouTubeEmbed } from "./youtube";

const dialogEl = document.querySelector<HTMLDialogElement>("#artist-dialog");
const dialogContentEl = document.querySelector<HTMLElement>("#artist-dialog-content");

if (!dialogEl || !dialogContentEl) throw new Error("Missing dialog elements");

const dialog = dialogEl;
const dialogContent = dialogContentEl;

enableBackdropDismiss(dialog);

const artistDetailsPromise: Promise<ArtistDetailsByName> = fetch(dialog.dataset.src ?? "").then((r) => r.json());

let currentArtistName: string | null = null;

function renderDialogContent(
  name: string,
  country: string | undefined,
  genre: string,
  artistDetails: ArtistDetailsByName,
) {
  const details = artistDetails[name];
  const links = details?.links ?? [];
  const officialVideoLink = links.find(
    (l) => l.label.toLowerCase().includes("vidéo") || l.label.toLowerCase().includes("video"),
  );
  const youtubeEmbed = officialVideoLink ? getYouTubeEmbed(officialVideoLink.url) : null;
  const remainingLinks = links.filter((l) => l !== officialVideoLink);

  const header = details?.imageUrl
    ? html`
        <div class="dialog-img-header">
          <img src="${details.imageUrl}" alt="" class="dialog-cover-img" />
          <div class="dialog-img-overlay"></div>
          <div class="dialog-img-caption">
            <h2 class="dialog-title-onimg">${name}</h2>
            ${country && html`<p class="dialog-subtitle-onimg">${country}</p>`}
          </div>
          <button type="button" commandfor="artist-dialog" command="close" class="dialog-close-onimg" aria-label="Fermer">×</button>
          ${
            youtubeEmbed &&
            html`
            <button type="button" data-play-video
              data-video-id="${youtubeEmbed.videoId}"
              data-video-start="${youtubeEmbed.start ?? ""}"
              data-video-url="${officialVideoLink?.url ?? ""}"
              class="dialog-play-btn" aria-label="Jouer la vidéo officielle">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="dialog-play-icon" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            </button>
          `
          }
        </div>`
    : html`
        <div class="dialog-header">
          <div class="dialog-header-main">
            <h2 class="dialog-title">${name}</h2>
            ${country && html`<p class="dialog-subtitle">${country}</p>`}
          </div>
          <button type="button" commandfor="artist-dialog" command="close" class="dialog-close" aria-label="Fermer">×</button>
        </div>`;

  dialogContent.innerHTML = html`
    ${header}
    <div class="dialog-genre-wrap">
      ${genre && html`<span class="dialog-genre-badge">${genre}</span>`}
    </div>
    ${
      details?.description
        ? html`<p class="dialog-description">${details.description}</p>`
        : html`<p class="dialog-description dialog-description--placeholder">Aucune biographie fournie.</p>`
    }
    ${
      remainingLinks.length > 0 &&
      html`
      <div class="dialog-links-wrap">
        <ul class="dialog-links">
          ${remainingLinks.map(
            (link) => html`
            <li><a href="${link.url}" target="_blank" rel="noopener noreferrer" class="dialog-link">${link.label}</a></li>
          `,
          )}
        </ul>
      </div>
    `
    }
  `.value;
}

async function openArtistDialog(name: string, country: string | undefined, genre: string) {
  currentArtistName = name;
  const artistDetails = await artistDetailsPromise;
  renderDialogContent(name, country, genre, artistDetails);
  dialog.showModal();
  history.pushState({ artistDialogOpen: true }, "");
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
  artistDetailsPromise.then((artistDetails) => {
    renderDialogContent(nextName, nextCountry, nextGenre, artistDetails);
  });
}

// Pressing the Android back button (or a browser back gesture) fires
// popstate before it would otherwise navigate away, letting us close the
// dialog instead of leaving the page. See openArtistDialog for the
// matching pushState.
let closingFromPopState = false;

window.addEventListener("popstate", () => {
  if (dialog.open) {
    closingFromPopState = true;
    dialog.close();
  }
});

dialog.addEventListener("close", () => {
  dialogContent.innerHTML = "";
  currentArtistName = null;
  if (!closingFromPopState && history.state?.artistDialogOpen) {
    history.back();
  }
  closingFromPopState = false;
});

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

dialog.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") {
    e.preventDefault();
    navigate(-1);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    navigate(1);
  }
});
