import { useEffect, useRef } from "preact/hooks";
import type { ArtistDetails } from "./data";

type Props = {
	artist: ArtistDetails | null;
	onClose: () => void;
};

export function ArtistDialog({ artist, onClose }: Props) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (artist) {
			dialog.showModal();
		} else {
			dialog.close();
		}
	}, [artist]);

	function handleBackdropClick(e: MouseEvent | KeyboardEvent) {
		if (e.target === dialogRef.current) onClose();
	}

	function handleCancel(e: Event) {
		e.preventDefault();
		onClose();
	}

	return (
		<dialog
			ref={dialogRef}
			onClick={handleBackdropClick}
			onKeyUp={handleBackdropClick}
			onCancel={handleCancel}
			class="rounded-xl shadow-2xl p-0 max-w-lg w-full backdrop:bg-black/50 open:flex open:flex-col"
		>
			{artist && (
				<div class="flex flex-col">
					{artist.imageUrl ? (
						<div class="relative">
							<img src={artist.imageUrl} alt={artist.name} class="w-full h-64 object-cover object-top rounded-t-xl" />
							<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent rounded-t-xl" />
							<button
								type="button"
								onClick={onClose}
								class="absolute top-3 right-3 text-white/80 hover:text-white text-2xl leading-none cursor-pointer"
								aria-label="Fermer"
							>
								×
							</button>
							<div class="absolute bottom-0 left-0 p-4">
								<h2 class="text-xl font-bold text-white">{artist.name}</h2>
								{artist.country && (
									<p class="text-sm text-white/80 flex items-center gap-1">
										{artist.country === "Québec" && <img src="/qc-flag.svg" alt="" class="h-4 w-auto flex-shrink-0" />}
										{artist.country}
									</p>
								)}
							</div>
						</div>
					) : (
						<div class="flex items-start justify-between gap-4 p-4 pb-2">
							<div class="flex-1 min-w-0">
								<h2 class="text-xl font-bold text-gray-900">{artist.name}</h2>
								{artist.country && (
									<p class="text-sm text-gray-500 flex items-center gap-1">
										{artist.country === "Québec" && <img src="/qc-flag.svg" alt="" class="h-4 w-auto flex-shrink-0" />}
										{artist.country}
									</p>
								)}
							</div>
							<button
								type="button"
								onClick={onClose}
								class="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0 cursor-pointer"
								aria-label="Fermer"
							>
								×
							</button>
						</div>
					)}

					<div class="px-4 pt-3 pb-1">
						<span
							class="text-xs font-medium px-2 py-1 rounded self-start"
							style={{ backgroundColor: artist.genreBg, color: artist.genreText }}
						>
							{artist.genre}
						</span>
					</div>

					{artist.description && (
						<div
							class="px-4 pb-3 text-sm text-gray-700 leading-relaxed"
							dangerouslySetInnerHTML={{ __html: artist.description }}
						/>
					)}

					{artist.links.length > 0 && (
						<div class="flex flex-wrap gap-2 px-4 pb-4">
							{artist.links.map((link) => (
								<a
									key={link.url}
									href={link.url}
									target="_blank"
									rel="noopener noreferrer"
									class="text-sm text-blue-600 hover:underline"
								>
									{link.label}
								</a>
							))}
						</div>
					)}
				</div>
			)}
		</dialog>
	);
}
