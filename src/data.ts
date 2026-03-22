import envoletRows from "../assets/envolet-schedule.json";
import feqRows from "../assets/schedule.json";

export type ArtistLink = { label: string; url: string };

export type ArtistDetails = {
  name: string;
  country?: string;
  genre: string;
  description?: string;
  imageUrl?: string;
  links: ArtistLink[];
};

export type ArtistDetailEntry = {
  description?: string;
  imageUrl?: string;
  links: ArtistLink[];
};

export type ArtistDetailsByName = Record<string, ArtistDetailEntry>;

export type Row = {
  date: string;
  venue: string;
  paid: boolean;
  time: string;
  artist: string;
  country?: string;
  genre: string;
};

export type EventConfig = {
  key: string;
  label: string;
  schedule: Map<string, Row[]>;
  artistDetailsFetch: Promise<ArtistDetailsByName>;
  getArtistDetails: () => ArtistDetailsByName | null;
  features: { freeFilter: boolean; quebecFilter: boolean; debutSort: boolean };
};

export const feq2026Config: EventConfig = buildEventConfig({
  key: "feq2026",
  label: "Festival d'Été de Québec 2026",
  rows: feqRows as Row[],
  detailsImport: () => import("../assets/artist-details.json"),
  features: { freeFilter: true, quebecFilter: true, debutSort: true },
});

export const envolet2026Config: EventConfig = buildEventConfig({
  key: "envolet2026",
  label: "Envol et Macadam 2026",
  rows: envoletRows as Row[],
  detailsImport: () => import("../assets/envolet-artist-details.json"),
  features: { freeFilter: false, quebecFilter: false, debutSort: false },
});

export const allEvents: EventConfig[] = [feq2026Config, envolet2026Config];

function buildScheduleMap(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const group = map.get(row.date);
    if (group) {
      group.push(row);
    } else {
      map.set(row.date, [row]);
    }
  }
  return map;
}

function buildEventConfig(opts: {
  key: string;
  label: string;
  rows: Row[];
  detailsImport: () => Promise<{ default: ArtistDetailsByName }>;
  features: { freeFilter: boolean; quebecFilter: boolean; debutSort: boolean };
}): EventConfig {
  let cache: ArtistDetailsByName | null = null;
  const artistDetailsFetch = opts.detailsImport().then((m) => {
    cache = m.default;
    return cache;
  });
  return {
    key: opts.key,
    label: opts.label,
    schedule: buildScheduleMap(opts.rows),
    artistDetailsFetch,
    getArtistDetails: () => cache,
    features: opts.features,
  };
}
