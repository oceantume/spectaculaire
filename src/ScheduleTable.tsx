import { schedule } from "./data";

function formatDayHeader(dateStr: string): string {
	const [year, month, day] = dateStr.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	return date.toLocaleDateString("fr-CA", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

export function ScheduleTable() {
	return (
		<div class="overflow-x-auto">
			<table class="w-full text-sm border-collapse">
				<thead>
					<tr class="text-left text-xs text-gray-500 uppercase tracking-wide">
						<th class="py-1 px-2 font-medium">Lieu</th>
						<th class="py-1 px-2 font-medium">Passe?</th>
						<th class="py-1 px-2 font-medium">Début</th>
						<th class="py-1 px-2 font-medium">Artiste</th>
						<th class="py-1 px-2 font-medium">Genre</th>
					</tr>
				</thead>
				<tbody>
					{Array.from(schedule.entries()).map(([dateStr, rows]) => (
						<>
							<tr class="day-header bg-gray-100">
								<th colspan={5} class="py-2 px-2 text-left text-sm font-semibold text-gray-700 capitalize">
									{formatDayHeader(dateStr)}
								</th>
							</tr>
							{rows.map((row) => (
								<tr class="border-b border-gray-100 hover:bg-gray-50">
									<td class="py-1 px-2 text-gray-700">{row.venue}</td>
									<td class="py-1 px-2">
										{row.paid ? (
											<span class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Payant</span>
										) : (
											<span class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">Gratuit</span>
										)}
									</td>
									<td class="py-1 px-2 tabular-nums text-gray-600">{row.time}</td>
									<td class="py-1 px-2 font-medium">{row.artist}</td>
									<td class="py-1 px-2 text-gray-500">{row.genre}</td>
								</tr>
							))}
						</>
					))}
				</tbody>
			</table>
		</div>
	);
}
