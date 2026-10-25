import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { YOUTUBE_EMBED_ORIGIN } from '../lib/youtube';
import { IconButton } from './common/ui';
import { RevealImage } from './common/RevealImage';
import { YoutubeIcon } from './common/BrandIcons';

interface YouTubeVideoProps {
  videoId: string;
  index: number;
  loaded: boolean;
  onPlay: (videoId: string) => void;
}

function YouTubeVideo({ videoId, index, loaded, onPlay }: YouTubeVideoProps) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('modDetails.video.title', { number: index + 1 })}
      className="aspect-video min-h-50 overflow-hidden rounded-sm border border-border bg-bg-tertiary"
    >
      {loaded ? (
        <iframe
          src={`${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}?autoplay=1`}
          title={t('modDetails.video.title', { number: index + 1 })}
          className="h-full min-h-50 w-full"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div className="relative flex h-full min-h-50 items-center justify-center p-4">
          <RevealImage
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="relative flex items-center gap-2">
            <IconButton
              icon={YoutubeIcon}
              label={t('modDetails.video.play')}
              className="bg-bg-tertiary"
              onClick={() => onPlay(videoId)}
            />
            <IconButton
              icon={ExternalLink}
              label={t('modDetails.video.watchOnYouTube')}
              className="bg-bg-tertiary"
              onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank', 'noopener,noreferrer')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModVideos({ videoIds = [] }: { videoIds?: readonly string[] }) {
  const { t } = useTranslation();
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  if (!videoIds.length) return null;

  return (
    <section aria-label={t('modDetails.sections.videos')}>
      <h3 className="font-semibold text-xs uppercase tracking-wide text-text-secondary mb-2">
        {t('modDetails.sections.videos')} {videoIds.length > 1 && <span className="text-text-secondary/70 normal-case tracking-normal">({videoIds.length})</span>}
      </h3>
      <div className="space-y-3">
        {videoIds.map((videoId, index) => (
          <YouTubeVideo
            key={videoId}
            videoId={videoId}
            index={index}
            loaded={activeVideoId === videoId}
            onPlay={setActiveVideoId}
          />
        ))}
      </div>
    </section>
  );
}
