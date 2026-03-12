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

export type Row = {
	dateStr: string;
	venue: string;
	paid: boolean;
	time: string;
	artist: string;
	artistDetails: ArtistDetails;
};

export const schedule: Map<string, Row[]> = new Map();
for (const row of rows as Row[]) {
	const group = schedule.get(row.dateStr);
	if (group) {
		group.push(row);
	} else {
		schedule.set(row.dateStr, [row]);
	}
}
