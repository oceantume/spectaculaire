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
	dateStr: string;
	venue: string;
	paid: boolean;
	time: string;
	artist: string;
	country?: string;
	genre: string;
};

export const schedule: Map<string, Row[]> = new Map();
for (const row of rows as unknown as Row[]) {
	const group = schedule.get(row.dateStr);
	if (group) {
		group.push(row);
	} else {
		schedule.set(row.dateStr, [row]);
	}
}

let artistDetailsCache: ArtistDetailsByName | null = null;
export const artistDetailsFetch = fetch("/assets/artist-details.json")
	.then((r) => r.json() as Promise<ArtistDetailsByName>)
	.then((d) => {
		artistDetailsCache = d;
		return d;
	});
export function getArtistDetails() {
	return artistDetailsCache;
}
