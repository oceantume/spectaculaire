import { useEffect, useRef, useState } from "preact/hooks";

type NavItem = {
	label: string;
	disabled?: boolean;
};

const items: NavItem[] = [
	{ label: "Le Festif!", disabled: true },
	{ label: "Fête de la Musique de Québec", disabled: true },
];

export function PageNav() {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div ref={ref} class="relative inline-block mb-4">
			<button
				type="button"
				class={`text-2xl font-bold flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors${open ? " bg-black/5" : " hover:bg-black/5"}`}
				onClick={() => setOpen((v) => !v)}
			>
				Programmation FEQ 2026
				<span class="text-base leading-none self-center">▾</span>
			</button>
			{open && (
				<div class="absolute top-full left-0 mt-1 bg-white rounded shadow-lg border border-gray-200 min-w-max z-30">
					{items.map((item) => (
						<div key={item.label} class="px-4 py-2 text-sm text-gray-400 cursor-not-allowed flex items-center gap-2">
							{item.label}
							<span class="text-xs">À venir</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
