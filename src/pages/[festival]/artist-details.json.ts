import type { APIRoute } from "astro";
import allFestivals from "../../content/festivals.json";
import type { ArtistDetailsByName, Festival } from "../../types";

const artistModules = import.meta.glob<{ default: ArtistDetailsByName }>(
  "../../content/festivals/*/artist-details.json",
  { eager: true },
);

export function getStaticPaths() {
  const festivals = import.meta.env.DEV ? allFestivals : allFestivals.filter((f) => !f.draft);
  return festivals.map((f) => {
    const festival = f as Festival;
    const key = Object.keys(artistModules).find((k) => k.includes(`/${festival.dataDir}/`));
    const artistDetails: ArtistDetailsByName = key ? artistModules[key].default : {};
    return { params: { festival: festival.slug }, props: { artistDetails } };
  });
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.artistDetails), {
    headers: { "Content-Type": "application/json" },
  });
