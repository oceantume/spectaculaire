import rows from "../assets/schedule.json";

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

export const schedule: Map<string, Row[]> = new Map();
for (const row of rows) {
	const group = schedule.get(row.date);
	if (group) {
		group.push(row);
	} else {
		schedule.set(row.date, [row]);
	}
}

let artistDetailsCache: ArtistDetailsByName | null = null;
export const artistDetailsFetch = import("../assets/artist-details.json").then((m) => {
	artistDetailsCache = m.default as ArtistDetailsByName;
	return artistDetailsCache;
});
export function getArtistDetails() {
	return artistDetailsCache;
}
