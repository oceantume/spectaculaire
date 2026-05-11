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
