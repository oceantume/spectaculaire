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
					<div class="flex items-start justify-between gap-4 p-4 pb-2">
						<div class="flex-1 min-w-0">
							<h2 class="text-xl font-bold text-gray-900 truncate">{artist.name}</h2>
							{artist.country && <p class="text-sm text-gray-500">{artist.country}</p>}
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

					<div class="flex gap-4 px-4 pb-3">
						{artist.imageUrl && (
							<img src={artist.imageUrl} alt={artist.name} class="w-24 h-24 object-cover rounded-lg flex-shrink-0" />
						)}
						<div class="flex flex-col justify-center">
							<span
								class="text-xs font-medium px-2 py-1 rounded self-start"
								style={{ backgroundColor: artist.genreBg, color: artist.genreText }}
							>
								{artist.genre}
							</span>
						</div>
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
