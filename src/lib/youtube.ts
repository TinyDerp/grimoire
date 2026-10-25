export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
// YouTube requires the installed app's identity when embedding from file://.
export const YOUTUBE_EMBED_REFERRER = 'https://com.grimoire.modmanager/';

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

/** Extract video identities, never arbitrary embed URLs from submission content. */
export function getYouTubeVideoIds(links: readonly string[] | null = []): string[] {
  const ids = new Set<string>();
  for (const link of links ?? []) {
    try {
      const url = new URL(link);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) continue;
      let id: string | null | undefined;
      if (url.hostname === 'youtu.be') {
        id = url.pathname.slice(1);
      } else if (youtubeHosts.has(url.hostname)) {
        id = url.pathname === '/watch'
          ? url.searchParams.get('v')
          : url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
      }
      if (id && videoIdPattern.test(id)) ids.add(id);
    } catch { /* Ignore unsupported or malformed embedded media. */ }
  }
  return [...ids];
}
