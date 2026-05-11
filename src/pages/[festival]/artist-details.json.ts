import type { APIRoute } from "astro";
import allFestivals from "../../content/festivals.json";
import type { ArtistDetailsByName, Festival } from "../../types";

const artistModules = import.meta.glob<{ default: ArtistDetailsByName }>(
  "../../content/festivals/*/artist-details.json",
  { eager: true },
);

const youtubeOverrideModules = import.meta.glob<{ default: Record<string, string> }>(
  "../../content/festivals/*/youtube-overrides.json",
  { eager: true },
);

export function getStaticPaths() {
  const festivals = import.meta.env.DEV ? allFestivals : allFestivals.filter((f) => !f.draft);
  return festivals.map((f) => {
    const festival = f as Festival;

    const artistKey = Object.keys(artistModules).find((k) => k.includes(`/${festival.dataDir}/`));
    const rawDetails: ArtistDetailsByName = artistKey ? artistModules[artistKey].default : {};

    const overridesKey = Object.keys(youtubeOverrideModules).find((k) => k.includes(`/${festival.dataDir}/`));
    const youtubeOverrides = overridesKey ? youtubeOverrideModules[overridesKey].default : {};
    const overridesNormalized = new Map(
      Object.entries(youtubeOverrides).map(([name, url]) => [name.toLowerCase().trim(), url]),
    );

    const artistDetails: ArtistDetailsByName = Object.fromEntries(
      Object.entries(rawDetails).map(([name, entry]) => {
        const overrideUrl = overridesNormalized.get(name.toLowerCase().trim());
        if (!overrideUrl) return [name, entry];
        return [
          name,
          {
            ...entry,
            links: [
              ...entry.links.filter(
                (l) => !l.label.toLowerCase().includes("vidéo") && !l.label.toLowerCase().includes("video"),
              ),
              { label: "Vidéo officielle", url: overrideUrl },
            ],
          },
        ];
      }),
    );

    return { params: { festival: festival.slug }, props: { artistDetails } };
  });
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.artistDetails), {
    headers: { "Content-Type": "application/json" },
  });
