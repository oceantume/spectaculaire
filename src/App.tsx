import { PageNav } from "./PageNav";
import { ScheduleTable } from "./ScheduleTable";

export function App() {
	return (
		<main class="p-2 sm:p-4">
			<PageNav />
			<ScheduleTable />
		</main>
	);
}
