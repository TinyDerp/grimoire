import { lazy, Suspense, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Star,
  Music,
  Shirt,
  Images,
  Box,
  Loader2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import HeroSkinsPanel from '../components/locker/HeroSkinsPanel';
import HeroCardPicker from '../components/locker/HeroCardPicker';
import HeroSoundPicker from '../components/locker/HeroSoundPicker';
import HeroEffectsPanel from '../components/locker/HeroEffectsPanel';
// three.js viewer is heavy; only pull the chunk when the user flips to 3D.
const HeroPoseViewer = lazy(() => import('../components/locker/HeroPoseViewer'));
import type { Mod } from '../types/mod';
import type { HeroPoseSkinSource } from '../types/portrait';
import {
  countLockerSkins,
  getHeroNamePath,
  getHeroRenderPath,
  getHeroWikiUrl,
  type HeroCategory,
} from '../lib/lockerUtils';

interface LockerHeroViewProps {
  hero: HeroCategory;
  skinList: Mod[];
  /** Sound-section mods mapped to this hero. Optional because the gallery
   *  view in `Locker.tsx` keeps the same prop surface and may not split sounds
   *  out yet. Empty/undefined hides the Sounds section entirely. */
  soundList?: Mod[];
  skinCount: number;
  isFavorite: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  onSelect: (modId: string) => void | Promise<void>;
  onToggleVariant: (modId: string) => void | Promise<void>;
  hideNsfwPreviews?: boolean;
}

type SectionId = 'skins' | 'sounds' | 'cards' | 'effects';

function poseSkinSelectionKey(mod: Mod): string {
  if (typeof mod.gameBananaId === 'number') {
    return [
      'gb',
      mod.gameBananaId,
      mod.gameBananaFileId ?? mod.sourceFileName ?? mod.sha256 ?? mod.id,
    ].join(':');
  }
  if (mod.sha256) return `sha:${mod.sha256}`;
  if (mod.sourceFileName) return `source:${mod.sourceFileName.toLowerCase()}`;
  return `id:${mod.id}`;
}

export function LockerHeroView({
  hero,
  skinList,
  soundList = [],
  skinCount,
  isFavorite,
  onBack,
  onToggleFavorite,
  onSelect,
  onToggleVariant,
  hideNsfwPreviews = false,
}: LockerHeroViewProps) {
  const [renderFallbackStep, setRenderFallbackStep] = useState(0);
  const [nameFailed, setNameFailed] = useState(false);
  const [view3d, setView3d] = useState(false);
  const [section, setSection] = useState<SectionId>('skins');
  const [poseSkinSelection, setPoseSkinSelection] = useState<{
    heroId: number;
    key: string;
  } | null>(null);
  const selectedPoseSkinKey =
    poseSkinSelection?.heroId === hero.id ? poseSkinSelection.key : null;

  // Single-skin fallback: prefer the last skin the user enabled in this view,
  // then fall back to the first enabled skin.
  const fallbackPoseSkinMetaKey = useMemo(() => {
    const selected = selectedPoseSkinKey
      ? skinList.find((mod) => poseSkinSelectionKey(mod) === selectedPoseSkinKey && mod.enabled)
      : null;
    return (selected ?? skinList.find((mod) => mod.enabled))?.metaKey;
  }, [skinList, selectedPoseSkinKey]);

  // Default 3D preview source: every currently enabled visual VPK for this hero.
  // The main process uses priority to build a preview merge that matches game
  // load order, and falls back to fallbackPoseSkinMetaKey if the stack cannot export.
  const activeSkinSources = useMemo<HeroPoseSkinSource[]>(
    () =>
      skinList
        .filter((mod) => mod.enabled)
        .map((mod) => ({ metaKey: mod.metaKey, priority: mod.priority }))
        .sort((a, b) => b.priority - a.priority || a.metaKey.localeCompare(b.metaKey)),
    [skinList]
  );
  const activeSkinSourceKey =
    activeSkinSources.map((source) => `${source.priority}:${source.metaKey}`).join('|') ||
    'vanilla';
  const hasSounds = soundList.length > 0;
  // If the active section runs out of mods (e.g. user deleted their last
  // sound for this hero) drop back to skins so the panel isn't stuck empty.
  const activeSection: SectionId = section === 'sounds' && !hasSounds ? 'skins' : section;
  // Group sound variants the same way skins are counted so the count matches
  // the gallery/list cards and the grouped rows rendered below.
  const soundCount = countLockerSkins(soundList);

  const sections: Array<{ id: SectionId; label: string; icon: LucideIcon; show: boolean }> = [
    { id: 'skins', label: 'Skins', icon: Shirt, show: true },
    { id: 'sounds', label: 'Sounds', icon: Music, show: hasSounds },
    { id: 'cards', label: 'Cards', icon: Images, show: true },
    { id: 'effects', label: 'Effects', icon: Sparkles, show: true },
  ];

  const renderSrc =
    renderFallbackStep === 0
      ? getHeroRenderPath(hero.name)
      : renderFallbackStep === 1
        ? getHeroWikiUrl(hero.name)
        : renderFallbackStep === 2
          ? (hero.iconUrl ?? '')
          : '';

  const handleRenderError = () => {
    if (renderFallbackStep === 0) {
      setRenderFallbackStep(1);
      return;
    }
    if (renderFallbackStep === 1 && hero.iconUrl) {
      setRenderFallbackStep(2);
      return;
    }
    setRenderFallbackStep(3);
  };

  const rememberPoseSkinSelection = (modId: string) => {
    const mod = skinList.find((entry) => entry.id === modId);
    if (!mod) return;
    const key = poseSkinSelectionKey(mod);

    setPoseSkinSelection((current) => {
      const currentKey = current?.heroId === hero.id ? current.key : null;
      if (mod.enabled) {
        return currentKey === key ? null : current;
      }
      return { heroId: hero.id, key };
    });
  };

  const handleSelect = async (modId: string) => {
    rememberPoseSkinSelection(modId);
    await onSelect(modId);
  };

  const handleToggleVariant = async (modId: string) => {
    rememberPoseSkinSelection(modId);
    await onToggleVariant(modId);
  };

  const sectionSubtitle =
    activeSection === 'cards'
      ? 'Card art'
      : activeSection === 'effects'
        ? 'Effects'
        : activeSection === 'sounds'
          ? soundCount > 0
            ? `${soundCount} sound${soundCount !== 1 ? 's' : ''}`
            : 'No sounds'
          : skinCount > 0
            ? `${skinCount} skin${skinCount !== 1 ? 's' : ''}`
            : 'No skins';

  const selectionPanel =
    activeSection === 'cards' ? (
      <HeroCardPicker heroName={hero.name} />
    ) : activeSection === 'effects' ? (
      <HeroEffectsPanel key={hero.name} heroName={hero.name} />
    ) : activeSection === 'sounds' ? (
      <HeroSoundPicker heroName={hero.name} soundList={soundList} onSelect={onSelect} />
    ) : (
      <HeroSkinsPanel
        mods={skinList}
        onSelect={handleSelect}
        onToggleVariant={handleToggleVariant}
        hideNsfwPreviews={hideNsfwPreviews}
        categoryId={hero.id}
        showDownloadable
        heroName={hero.name}
        emptyMessage="Download a skin for this hero to manage it here."
      />
    );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Section rail (lg+): the armory nav. Vertical so it scales to however
          many cosmetic surfaces the locker grows without crowding. */}
      <nav
        aria-label="Locker sections"
        className="hidden lg:flex w-48 xl:w-52 flex-shrink-0 flex-col gap-1 border-r border-border/60 bg-bg-secondary/60 p-4 animate-slide-in-left"
      >
        {sections
          .filter((s) => s.show)
          .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => setSection(id)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                activeSection === id
                  ? 'bg-accent/15 text-text-primary border border-accent/40'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
      </nav>

      {/* Selection panel: centered column with comfortable reading width. */}
      <div className="relative min-w-0 flex-1 overflow-y-auto scrollbar-glass bg-bg-primary">
        <div className="mx-auto w-full max-w-xl p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={onToggleFavorite}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                isFavorite
                  ? 'border-yellow-400/60 bg-yellow-400/20 text-yellow-300'
                  : 'border-border/70 text-text-secondary hover:text-text-primary'
              }`}
            >
              <Star className="w-4 h-4" />
              {isFavorite ? 'Favorite' : 'Save'}
            </button>
          </div>

          {/* Hero Name */}
          <div className="flex items-center gap-3">
            {nameFailed ? (
              <h1 className="text-2xl font-bold text-text-primary">{hero.name}</h1>
            ) : (
              <img
                src={getHeroNamePath(hero.name)}
                alt={hero.name}
                className="h-8 w-auto object-contain"
                onError={() => setNameFailed(true)}
              />
            )}
            <span className="text-sm text-text-secondary">{sectionSubtitle}</span>
          </div>

          {/* Section pills (below lg, where the rail is hidden). */}
          <div
            role="tablist"
            aria-label="Section"
            className="inline-flex lg:hidden items-center rounded-full border border-border bg-bg-tertiary p-0.5 text-xs"
          >
            {sections
              .filter((s) => s.show)
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === id}
                  onClick={() => setSection(id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors cursor-pointer ${
                    activeSection === id
                      ? 'bg-accent/15 text-text-primary border border-accent/40'
                      : 'text-text-secondary hover:text-text-primary border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
          </div>

          <div className="space-y-4">{selectionPanel}</div>
        </div>
      </div>

      {/* Hero viewer pane (lg+): a first-class column instead of a backdrop,
          so the 3D viewer is fully visible and interactive. */}
      <div className="relative hidden lg:block w-[38%] xl:w-[42%] flex-shrink-0 overflow-hidden border-l border-border/60 bg-bg-primary animate-hero-zoom-in">
        {view3d ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white/80" />
              </div>
            }
          >
            <HeroPoseViewer
              key={`${hero.name}:${activeSkinSourceKey}:${fallbackPoseSkinMetaKey ?? ''}`}
              heroName={hero.name}
              skinSources={activeSkinSources}
              fallbackSkinMetaKey={fallbackPoseSkinMetaKey}
            />
          </Suspense>
        ) : renderSrc ? (
          <img
            src={renderSrc}
            alt={hero.name}
            className="absolute inset-0 h-full w-full object-contain"
            onError={handleRenderError}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-secondary text-2xl">
            {hero.name}
          </div>
        )}

        {/* Bottom gradient for depth (2D only; the 3D viewer owns its frame) */}
        {!view3d && (
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />
        )}

        {/* 2D portrait <-> live 3D pose toggle. */}
        <button
          type="button"
          onClick={() => setView3d((v) => !v)}
          aria-pressed={view3d}
          title={view3d ? 'Show 2D portrait' : 'Show live 3D pose'}
          className={`absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            view3d
              ? 'border-accent/60 bg-accent/20 text-text-primary'
              : 'border-border/70 bg-bg-secondary/70 text-text-secondary hover:text-text-primary backdrop-blur'
          }`}
        >
          <Box className="h-3.5 w-3.5" />
          {view3d ? '2D' : '3D'}
        </button>
      </div>
    </div>
  );
}
