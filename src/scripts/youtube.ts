export function getYouTubeEmbed(url: string): { videoId: string; start?: number } | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1) || null;
    } else if (u.hostname.includes("youtube.com")) {
      videoId = u.searchParams.get("v");
    }
    if (!videoId) return null;
    const t = u.searchParams.get("t");
    const start = t ? parseInt(t, 10) : undefined;
    return { videoId, start };
  } catch {
    return null;
  }
}
