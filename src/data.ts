import raw from "../assets/programmation.json";

type Venue = {
	id: number;
	te: string;
	ln: string;
	tt: boolean;
	or: number;
};

type Show = {
	id: number;
	ve: number;
	st: string;
	at: {
		te: string;
		sc: { name: string };
	};
};

const { ve, sw } = (raw[1] as { data: { mamData: { ve: Venue[]; sw: Show[] } } }).data.mamData;

const venueById = Object.fromEntries(ve.map((v) => [v.id, v]));

const venueOrderByLn: Record<string, number> = {};
for (const v of ve) {
	if (!(v.ln in venueOrderByLn) || v.or < venueOrderByLn[v.ln]) venueOrderByLn[v.ln] = v.or;
}

function toEDT(utcStr: string): Date {
	return new Date(new Date(utcStr).getTime() - 4 * 60 * 60 * 1000);
}

function localDateStr(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function localTimeStr(date: Date): string {
	return date.toISOString().slice(11, 16);
}

export type Row = {
	dateStr: string;
	venue: string;
	paid: boolean;
	time: string;
	artist: string;
	genre: string;
};

const rows: Row[] = sw
	.map((show) => {
		const edt = toEDT(show.st);
		const venue = venueById[show.ve];
		return {
			dateStr: localDateStr(edt),
			venue: venue.ln,
			paid: venue.tt,
			time: localTimeStr(edt),
			artist: show.at.te,
			genre: show.at.sc.name,
		};
	})
	.sort(
		(a, b) =>
			a.dateStr.localeCompare(b.dateStr) ||
			(b.paid ? 1 : 0) - (a.paid ? 1 : 0) ||
			venueOrderByLn[a.venue] - venueOrderByLn[b.venue] ||
			a.time.localeCompare(b.time),
	);

export const schedule: Map<string, Row[]> = new Map();
for (const row of rows) {
	const group = schedule.get(row.dateStr);
	if (group) {
		group.push(row);
	} else {
		schedule.set(row.dateStr, [row]);
	}
}
