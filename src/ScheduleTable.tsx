import { useEffect, useState } from "preact/hooks";
import { ArtistDialog } from "./ArtistDialog";
import {
	type ArtistDetails,
	type ArtistDetailsByName,
	artistDetailsFetch,
	getArtistDetails,
	type Row,
	schedule,
} from "./data";
import { useStoredState } from "./useStoredState";

export function ScheduleTable() {
	const [selectedArtist, setSelectedArtist] = useState<ArtistDetails | null>(null);
	const [showFreeOnly, setShowFreeOnly] = useStoredState("feq2026:free", false);
	const [showQuebecOnly, setShowQuebecOnly] = useStoredState("feq2026:quebec", false);
	const [sortByStart, setSortByStart] = useStoredState("feq2026:start", false);
	const [artistDetails, setArtistDetails] = useState<ArtistDetailsByName | null>(getArtistDetails());

	useEffect(() => {
		if (!artistDetails) artistDetailsFetch.then(setArtistDetails);
	}, []);

	const filteredRows = Array.from(schedule.values()).flatMap((rows) => {
		let r = rows;
		if (showFreeOnly) r = r.filter((row) => !row.paid);
		if (showQuebecOnly) r = r.filter((row) => row.country === "Québec");
		if (sortByStart) r = sortRows(r);
		return r;
	});

	function rowToArtistDetails(row: Row): ArtistDetails {
		const details = artistDetails?.[row.artist];
		return {
			name: row.artist,
			country: row.country,
			genre: row.genre,
			description: details?.description,
			imageUrl: details?.imageUrl,
			links: details?.links ?? [],
		};
	}

	function navigate(delta: -1 | 1) {
		if (!selectedArtist) return;
		const idx = filteredRows.findIndex((r) => r.artist === selectedArtist.name);
		if (idx === -1) return;
		const next = (idx + delta + filteredRows.length) % filteredRows.length;
		setSelectedArtist(rowToArtistDetails(filteredRows[next]));
	}

	return (
		<>
			<div>
				<div class="flex gap-2 px-2 py-2">
					<button
						type="button"
						onClick={() => {
							setShowFreeOnly(false);
							setShowQuebecOnly(false);
						}}
						class={`cursor-pointer text-xs px-3 py-1 rounded-full border ${!showFreeOnly && !showQuebecOnly ? "bg-gray-800 text-white border-gray-800" : "text-gray-600 border-gray-300 hover:bg-gray-50"}`}
					>
						Toute
					</button>
					<button
						type="button"
						onClick={() => setShowFreeOnly((v) => !v)}
						class={`cursor-pointer text-xs px-3 py-1 rounded-full border ${showFreeOnly ? "bg-green-100 text-green-900 border-green-300" : "text-gray-600 border-gray-300 hover:bg-gray-50"}`}
					>
						Gratuit
					</button>
					<button
						type="button"
						onClick={() => setShowQuebecOnly((v) => !v)}
						class={`cursor-pointer text-xs px-3 py-1 rounded-full border flex items-center gap-1 ${showQuebecOnly ? "bg-blue-100 text-blue-900 border-blue-300" : "text-gray-600 border-gray-300 hover:bg-gray-50"}`}
					>
						<img src="/qc.svg" alt="" class="h-3.5 w-2.5 inline-block" />
						Québécois
					</button>
				</div>
				<table class="w-full text-sm border-collapse">
					<thead>
						<tr class="text-left text-xs text-gray-500 uppercase tracking-wide">
							<th class="py-1 px-1 sm:px-2 font-medium sticky top-0 z-20 bg-white">Lieu</th>
							{!showFreeOnly && <th class="py-1 px-1 sm:px-2 font-medium sticky top-0 z-20 bg-white">Passe?</th>}
							<th
								class="py-1 px-1 sm:px-2 font-medium sticky top-0 z-20 bg-white cursor-pointer select-none"
								onClick={() => setSortByStart((v) => !v)}
							>
								<span class={sortByStart ? "underline text-gray-900" : ""}>Début</span>
							</th>
							<th class="py-1 px-1 sm:px-2 font-medium sticky top-0 z-20 bg-white">Artiste</th>
							<th class="py-1 px-1 sm:px-2 font-medium sticky top-0 z-20 bg-white hidden xs:table-cell">Genre</th>
						</tr>
					</thead>
					<tbody>
						{Array.from(schedule.entries()).map(([date, rows]) => {
							let filtered = showFreeOnly ? rows.filter((r) => !r.paid) : rows;
							if (showQuebecOnly) filtered = filtered.filter((r) => r.country === "Québec");
							if (sortByStart) filtered = sortRows(filtered);
							if (filtered.length === 0) return null;
							return (
								<>
									<tr class="day-header bg-gray-100">
										<th
											colspan={10}
											class="py-2 px-1 sm:px-2 text-left text-sm font-semibold text-gray-700 capitalize sticky top-6 z-10 bg-gray-100"
										>
											{formatDayHeader(date)}
										</th>
									</tr>
									{filtered.map((row) => (
										<tr class="border-b border-gray-100 hover:bg-gray-50">
											<td class="py-1 px-1 sm:px-2 text-gray-700">{row.venue}</td>
											{!showFreeOnly && (
												<td class="py-1 px-1 sm:px-2">
													{row.paid ? (
														<span class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Payant</span>
													) : (
														<span class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">Gratuit</span>
													)}
												</td>
											)}
											<td class="py-1 px-1 sm:px-2 tabular-nums text-gray-600">{row.time}</td>
											<td class="py-1 px-1 sm:px-2 font-medium">
												<button
													type="button"
													onClick={() => setSelectedArtist(rowToArtistDetails(row))}
													class="cursor-pointer underline text-left"
												>
													{row.country === "Québec" ? (
														<>
															{row.artist.slice(0, row.artist.lastIndexOf(" ") + 1)}
															<span class="whitespace-nowrap">
																{row.artist.slice(row.artist.lastIndexOf(" ") + 1)}
																<img src="/qc.svg" alt="Québec" class="h-4 w-3 inline-block align-middle ml-1" />
															</span>
														</>
													) : (
														row.artist
													)}
												</button>
											</td>
											<td class="py-1 px-1 sm:px-2 text-gray-500 hidden xs:table-cell">{row.genre}</td>
										</tr>
									))}
								</>
							);
						})}
					</tbody>
				</table>
			</div>
			<ArtistDialog
				artist={selectedArtist}
				onClose={() => setSelectedArtist(null)}
				onPrevious={() => navigate(-1)}
				onNext={() => navigate(1)}
			/>
		</>
	);
}

function formatDayHeader(date: string): string {
	const [year, month, day] = date.split("-").map(Number);
	const d = new Date(year, month - 1, day);
	return d.toLocaleDateString("fr-CA", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function sortRows(rows: Row[]): Row[] {
	return [...rows].sort((a, b) => a.time.localeCompare(b.time));
}
