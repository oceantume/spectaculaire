export function resolveVenue(rawVenue: string, overrides: Record<string, string>): string {
  if (rawVenue in overrides) return overrides[rawVenue];
  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith("^") && new RegExp(key).test(rawVenue)) return value;
  }
  return rawVenue;
}

export type ArtistLink = { label: string; url: string };

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
  genre?: string;
  type?: string;
};

export type Festival = {
  name: string;
  shortName: string;
  slug: string;
  year: number;
  region: string;
  features: string[];
  dataDir: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  sourceAttribution: string | null;
  draft: boolean;
};

export type ChangeDetail = { field: "time" | "venue" | "paid"; from: string; to: string };

export type ScheduleChange = {
  type: "added" | "removed" | "updated";
  artist: string;
  showDate: string;
  time?: string;
  details?: ChangeDetail[];
};

export type ChangelogCommit = { hash: string; date: string; changes: ScheduleChange[] };

export type FestivalChangelog = ChangelogCommit[];
