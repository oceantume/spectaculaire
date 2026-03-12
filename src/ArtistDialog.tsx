import { useEffect, useRef, useState } from "preact/hooks";
import type { ArtistDetails } from "./data";

type Props = {
	artist: ArtistDetails | null;
	onClose: () => void;
	onPrevious?: () => void;
	onNext?: () => void;
};

export function ArtistDialog({ artist, onClose, onPrevious, onNext }: Props) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [isPlayingVideo, setIsPlayingVideo] = useState(false);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (artist) {
			dialog.showModal();
		} else {
			dialog.close();
		}
	}, [artist]);

	useBodyScrollLock(!!artist);

	useEffect(() => {
		setIsPlayingVideo(false);
	}, [artist]);

	function handleBackdropClick(e: MouseEvent | KeyboardEvent) {
		if (e.target === dialogRef.current) onClose();
	}

	function handleCancel(e: Event) {
		e.preventDefault();
		onClose();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			onPrevious?.();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			onNext?.();
		}
	}

	const officialVideoLink = artist?.links.find(
		(l) => l.label.toLowerCase().includes("vidéo") || l.label.toLowerCase().includes("video"),
	);
	const youtubeEmbed = officialVideoLink ? getYouTubeEmbed(officialVideoLink.url) : null;
	const remainingLinks = artist?.links.filter((l) => l !== officialVideoLink) ?? [];

	return (
		<dialog
			ref={dialogRef}
			onClick={handleBackdropClick}
			onKeyDown={handleKeyDown}
			onCancel={handleCancel}
			class="rounded-xl shadow-2xl p-0 max-w-lg w-full backdrop:bg-black/50 open:flex open:flex-col"
		>
			{artist && (
				<div class="flex flex-col">
					{artist.imageUrl ? (
						<div class="relative">
							{isPlayingVideo && youtubeEmbed ? (
								<iframe
									src={`https://www.youtube.com/embed/${youtubeEmbed.videoId}?autoplay=1&rel=0${youtubeEmbed.start ? `&start=${youtubeEmbed.start}` : ""}`}
									title="Vidéo officielle"
									class="w-full h-64 rounded-t-xl"
									allow="autoplay; encrypted-media"
									allowFullScreen
								/>
							) : (
								<>
									<img
										src={artist.imageUrl}
										alt={artist.name}
										class="w-full h-64 object-cover object-top rounded-t-xl"
									/>
									<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent rounded-t-xl" />
									<div class="absolute bottom-0 left-0 p-4">
										<h2 class="text-xl font-bold text-white">{artist.name}</h2>
										{artist.country && (
											<p class="text-sm text-white/80 flex items-center gap-1">
												{artist.country === "Québec" && <img src="/qc.svg" alt="" class="h-4 w-3 flex-shrink-0" />}
												{artist.country}
											</p>
										)}
									</div>
									<button
										type="button"
										onClick={onClose}
										class="absolute top-3 right-3 text-white/80 hover:text-white text-2xl leading-none cursor-pointer"
										aria-label="Fermer"
									>
										×
									</button>
									{youtubeEmbed && (
										<a
											href={officialVideoLink?.url}
											target="_blank"
											rel="noopener noreferrer"
											onClick={(e) => {
												e.preventDefault();
												setIsPlayingVideo(true);
											}}
											class="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full w-10 h-10 flex items-center justify-center cursor-pointer"
											aria-label="Jouer la vidéo officielle"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="currentColor"
												class="w-5 h-5"
												role="img"
												aria-label="Jouer la vidéo officielle"
											>
												<title>Jouer la vidéo officielle</title>
												<path d="M8 5v14l11-7z" />
											</svg>
										</a>
									)}
								</>
							)}
						</div>
					) : (
						<div class="flex items-start justify-between gap-4 p-4 pb-2">
							<div class="flex-1 min-w-0">
								<h2 class="text-xl font-bold text-gray-900">{artist.name}</h2>
								{artist.country && (
									<p class="text-sm text-gray-500 flex items-center gap-1">
										{artist.country === "Québec" && <img src="/qc.svg" alt="" class="h-4 w-3 flex-shrink-0" />}
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

					{remainingLinks.length > 0 && (
						<div class="flex flex-wrap gap-2 px-4 pb-4">
							{remainingLinks.map((link) => (
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

function getYouTubeEmbed(url: string): { videoId: string; start?: number } | null {
	try {
		const u = new URL(url);
		if (!u.hostname.includes("youtube.com")) return null;
		const videoId = u.searchParams.get("v");
		if (!videoId) return null;
		const t = u.searchParams.get("t");
		const start = t ? parseInt(t, 10) : undefined;
		return { videoId, start };
	} catch {
		return null;
	}
}

function useBodyScrollLock(locked: boolean) {
	useEffect(() => {
		if (locked) {
			document.body.style.overflow = "hidden";
			return () => {
				document.body.style.overflow = "";
			};
		}
	}, [locked]);
}
