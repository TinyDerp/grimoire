import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Check,
  RefreshCw,
  RotateCcw,
  Shirt,
  Zap,
} from 'lucide-react';
import {
  applyTrippySkin,
  applyTrippyVfx,
  getActiveHeroColor,
  getActiveTrippySkin,
  getHeroColorSupport,
  getGameRunningStatus,
  previewTrippySprite,
  revertHeroColor,
  revertTrippySkin,
} from '../../lib/api';
import TrippySpriteSwatch from './TrippySpriteSwatch';
import {
  TRIPPY_STYLES,
  TRIPPY_ANIMATION_STYLES,
  type ActiveTrippySkin,
  type TrippyAnimationStyle,
  type TrippySkinTargets,
  type TrippySpriteResult,
  type TrippyStyleName,
  type TrippyVfxChoice,
  type TrippyVfxTargets,
} from '../../types/mod';

interface TrippyEffectsPanelProps {
  heroName: string;
}

const STYLE_LABELS: Record<TrippyStyleName, string> = {
  confetti: 'Confetti',
  liquid: 'Liquid',
  moire: 'Moire',
  kaleido: 'Kaleido',
  holo: 'Holo',
  glitch: 'Glitch',
  thermal: 'Thermal',
  gradient: 'Gradient',
};

const ANIMATION_LABELS: Record<TrippyAnimationStyle, string> = {
  off: 'Off',
  sweep: 'Sweep',
  loop: 'Loop',
  cycle: 'Cycle',
};

const pct = (x: number): number => Math.round(x * 100);

/** Quantize to the same 2 decimals the main process keys its caches by, so the
 *  dirty check compares like with like. */
const q = (x: number): number => Math.round(x * 100) / 100;

/**
 * EXPERIMENTAL: paint a hero with procedural trippy patterns via the bundled
 * vpkmerge. Two surfaces, mirroring the CLI split:
 *  - Skin (`trippy-skin`): repaints body/weapon material textures with the
 *    pattern plus a runtime UV-scroll, so the paint flows in game.
 *  - Ability VFX (`trippy-vfx`): paints + animates the hero's ability/weapon
 *    particles over the same pinned recipes as the color recolor.
 * The live swatches are the REAL pattern function (rendered by the binary as a
 * sprite strip), not a CSS approximation, so what loops here is what bakes.
 */
export default function TrippyEffectsPanel({ heroName }: TrippyEffectsPanelProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'skin' | 'vfx'>('skin');

  // Shared pattern knobs.
  const [style, setStyle] = useState<TrippyStyleName>('confetti');
  const [intensity, setIntensity] = useState(1);
  const [phase, setPhase] = useState(0);
  // Skin-only knobs.
  const [scroll, setScroll] = useState(1);
  const [skinTargets, setSkinTargets] = useState<TrippySkinTargets>('all');
  // VFX-only knobs.
  const [animationStyle, setAnimationStyle] = useState<TrippyAnimationStyle>('cycle');
  const [animationIntensity, setAnimationIntensity] = useState(1);
  const [vfxTargets, setVfxTargets] = useState<TrippyVfxTargets>('all');

  // What's applied in-game right now.
  const [activeSkin, setActiveSkin] = useState<ActiveTrippySkin | null>(null);
  const [activeVfx, setActiveVfx] = useState<TrippyVfxChoice | null>(null);
  // Non-trippy recolor applied via the Colors tab (so we can warn on replace).
  const [otherColorApplied, setOtherColorApplied] = useState(false);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);

  // Live sprites: one per style for the picker strip (fixed params, fetched
  // once; the main process caches them on disk), plus the big swatch that
  // tracks the sliders (debounced).
  const [styleSprites, setStyleSprites] = useState<
    Partial<Record<TrippyStyleName, TrippySpriteResult>>
  >({});
  const [mainSprite, setMainSprite] = useState<TrippySpriteResult | null>(null);
  const [spriteFailed, setSpriteFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setActionError(null);
    Promise.all([
      getHeroColorSupport(heroName),
      getActiveTrippySkin(heroName),
      getActiveHeroColor(heroName),
      getGameRunningStatus().catch(() => ({ running: false })),
    ])
      .then(([isSupported, skin, color, status]) => {
        if (!mounted.current) return;
        setSupported(isSupported);
        setActiveSkin(skin);
        const vfx = color?.mode === 'trippy' ? (color.trippy ?? null) : null;
        setActiveVfx(vfx);
        setOtherColorApplied(!!color && color.mode !== 'trippy');
        setGameRunning(status.running);
        // Reflect whatever is applied (skin first) so the sliders read back.
        const seed = skin ?? vfx;
        if (seed) {
          setStyle(seed.style);
          setIntensity(seed.intensity);
          setPhase(seed.phase);
        }
        if (skin) {
          setScroll(skin.scroll);
          setSkinTargets(skin.targets);
        }
        if (vfx) {
          setAnimationStyle(vfx.animationStyle);
          setAnimationIntensity(vfx.animationIntensity);
          setVfxTargets(vfx.targets);
          if (!skin) setTab('vfx');
        }
      })
      .catch((err) => {
        if (mounted.current) setError(String(err));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [heroName]);

  // Style strip sprites: fixed params so the disk cache makes this a one-time
  // cost ever, not per hero or per visit.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    Promise.all(
      TRIPPY_STYLES.map((s) =>
        previewTrippySprite({ style: s, phase: 0, scroll: 1, intensity: 1, frames: 12, size: 48 })
          .then((sprite) => [s, sprite] as const)
          .catch(() => null),
      ),
    ).then((entries) => {
      if (cancelled || !mounted.current) return;
      const next: Partial<Record<TrippyStyleName, TrippySpriteResult>> = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setStyleSprites(next);
      if (entries.every((e) => e === null)) setSpriteFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  // Big swatch tracks the sliders, debounced. The scroll knob feeding the loop
  // is the one that will drive the bake on the active tab.
  const loopScroll = tab === 'skin' ? scroll : animationIntensity;
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      previewTrippySprite({
        style,
        phase: q(phase),
        scroll: q(loopScroll),
        intensity: q(intensity),
        frames: 24,
        size: 128,
      })
        .then((sprite) => {
          if (!cancelled && mounted.current) {
            setMainSprite(sprite);
            setSpriteFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled && mounted.current) setSpriteFailed(true);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [supported, style, phase, loopScroll, intensity]);

  const refreshGameRunning = async () => {
    try {
      setGameRunning((await getGameRunningStatus()).running);
    } catch {
      // keep prior value
    }
  };

  const handleApply = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (tab === 'skin') {
        const result = await applyTrippySkin(heroName, {
          style,
          intensity,
          scroll,
          phase,
          targets: skinTargets,
        });
        if (!mounted.current) return;
        if (result.style !== null) {
          setActiveSkin({
            style: result.style,
            intensity: result.intensity ?? 1,
            scroll: result.scroll ?? 1,
            phase: result.phase ?? 0,
            targets: result.targets ?? 'all',
          });
        }
      } else {
        const result = await applyTrippyVfx(heroName, {
          style,
          intensity,
          phase,
          animationStyle,
          animationIntensity,
          targets: vfxTargets,
        });
        if (!mounted.current) return;
        setActiveVfx(result);
        setOtherColorApplied(false);
      }
      setChanged(true);
      await refreshGameRunning();
    } catch (err) {
      if (mounted.current) setActionError(String(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (tab === 'skin') {
        await revertTrippySkin(heroName);
        if (!mounted.current) return;
        setActiveSkin(null);
      } else {
        // The trippy VFX lives in the shared colors selection set.
        await revertHeroColor(heroName);
        if (!mounted.current) return;
        setActiveVfx(null);
      }
      setChanged(true);
      await refreshGameRunning();
    } catch (err) {
      if (mounted.current) setActionError(String(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const applied = tab === 'skin' ? activeSkin !== null : activeVfx !== null;
  const dirty =
    tab === 'skin'
      ? !activeSkin ||
        activeSkin.style !== style ||
        activeSkin.intensity !== q(intensity) ||
        activeSkin.scroll !== q(scroll) ||
        activeSkin.phase !== q(phase) ||
        activeSkin.targets !== skinTargets
      : !activeVfx ||
        activeVfx.style !== style ||
        activeVfx.intensity !== q(intensity) ||
        activeVfx.phase !== q(phase) ||
        activeVfx.animationStyle !== animationStyle ||
        activeVfx.animationIntensity !== q(animationIntensity) ||
        activeVfx.targets !== vfxTargets;

  const segBtn = (selected: boolean) =>
    `rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
      selected
        ? 'border border-accent/40 bg-accent/10 text-text-primary'
        : 'border border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
    }`;

  return (
    <section className="space-y-3 border-t border-border/60 pt-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">Trippy Effects</h3>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          Experimental
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-xs text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 py-2 text-xs text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {!loading && !error && supported === false && (
        <p className="text-xs text-text-secondary">
          Trippy effects aren&apos;t available for {heroName} yet (no pinned recipe in the
          bundled vpkmerge). More heroes are coming.
        </p>
      )}

      {!loading && !error && supported && (
        <>
          <p className="text-xs text-text-secondary">
            Paint {heroName} with a flowing procedural pattern. Skin repaints the body and gun
            textures (the paint scrolls in game); Ability VFX paints and animates the ability
            effects. The swatches below are the real pattern, looping at the speed it will move.
          </p>

          {/* Surface toggle: body/gun materials vs ability particles. */}
          <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
            <button
              type="button"
              disabled={busy}
              onClick={() => setTab('skin')}
              className={`flex items-center gap-1.5 ${segBtn(tab === 'skin')}`}
            >
              <Shirt className="h-3.5 w-3.5" /> Skin
              {activeSkin && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setTab('vfx')}
              className={`flex items-center gap-1.5 ${segBtn(tab === 'vfx')}`}
            >
              <Zap className="h-3.5 w-3.5" /> Ability VFX
              {activeVfx && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
          </div>

          {/* Live pattern swatch + current params */}
          <div className="flex items-center gap-3">
            <TrippySpriteSwatch
              sprite={mainSprite}
              className="h-20 w-20 flex-shrink-0 rounded-md border border-border object-cover shadow-inner"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary">
                {STYLE_LABELS[style]}
                <span className="text-text-secondary">
                  {' '}
                  · {pct(intensity)}%
                  {tab === 'skin'
                    ? ` · scroll ${pct(scroll)}%`
                    : ` · ${ANIMATION_LABELS[animationStyle]} ${pct(animationIntensity)}%`}
                </span>
              </div>
              <div className="text-[11px] text-text-secondary">
                {!applied
                  ? tab === 'skin'
                    ? 'No trippy skin applied'
                    : 'No trippy VFX applied'
                  : !dirty
                    ? 'Applied'
                    : tab === 'skin' && activeSkin
                      ? `Applied: ${STYLE_LABELS[activeSkin.style]} · ${pct(activeSkin.intensity)}% · ${activeSkin.targets}`
                      : activeVfx
                        ? `Applied: ${STYLE_LABELS[activeVfx.style]} · ${ANIMATION_LABELS[activeVfx.animationStyle]} · ${activeVfx.targets}`
                        : ''}
              </div>
              {spriteFailed && (
                <div className="text-[11px] text-amber-400/90">
                  Live swatch unavailable (vpkmerge binary missing or too old).
                </div>
              )}
            </div>
          </div>

          {/* Style strip: every style as a small looping swatch. */}
          <div className="flex flex-wrap gap-1.5">
            {TRIPPY_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => setStyle(s)}
                title={STYLE_LABELS[s]}
                aria-label={STYLE_LABELS[s]}
                className={`overflow-hidden rounded-md border transition-transform hover:scale-105 disabled:cursor-not-allowed ${
                  style === s ? 'border-text-primary ring-2 ring-accent/60' : 'border-border'
                }`}
              >
                <TrippySpriteSwatch sprite={styleSprites[s] ?? null} className="h-9 w-9" />
              </button>
            ))}
          </div>

          {/* Pattern strength: 0 keeps the original texture, 1 is full paint. */}
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-text-secondary">
              Intensity{' '}
              <span className="tabular-nums text-text-secondary/70">{pct(intensity)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct(intensity)}
              disabled={busy}
              onChange={(e) => setIntensity(Number(e.target.value) / 100)}
              className="h-3 w-full cursor-pointer appearance-none rounded-full bg-bg-tertiary disabled:cursor-not-allowed"
            />
          </label>

          {/* Phase: shifts the pattern/hue starting point. */}
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-text-secondary">
              Phase <span className="tabular-nums text-text-secondary/70">{pct(phase)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct(phase)}
              disabled={busy}
              onChange={(e) => setPhase(Number(e.target.value) / 100)}
              className="h-3 w-full cursor-pointer appearance-none rounded-full bg-bg-tertiary disabled:cursor-not-allowed"
            />
          </label>

          {tab === 'skin' ? (
            <>
              {/* Runtime UV-scroll speed (how fast the paint flows in game). */}
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-text-secondary">
                  Scroll speed{' '}
                  <span className="tabular-nums text-text-secondary/70">{pct(scroll)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={400}
                  step={10}
                  value={pct(scroll)}
                  disabled={busy}
                  onChange={(e) => setScroll(Number(e.target.value) / 100)}
                  className="h-3 w-full cursor-pointer appearance-none rounded-full bg-bg-tertiary disabled:cursor-not-allowed"
                />
              </label>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-text-secondary">Paint</span>
                <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                  {(['all', 'body', 'weapons'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy}
                      onClick={() => setSkinTargets(t)}
                      className={segBtn(skinTargets === t)}
                    >
                      {t === 'all' ? 'Body + Gun' : t === 'body' ? 'Body' : 'Gun'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Particle animation depth + strength. */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-text-secondary">Animation</span>
                <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                  {TRIPPY_ANIMATION_STYLES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={busy}
                      onClick={() => setAnimationStyle(a)}
                      className={segBtn(animationStyle === a)}
                    >
                      {ANIMATION_LABELS[a]}
                    </button>
                  ))}
                </div>
              </div>

              {animationStyle !== 'off' && (
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-text-secondary">
                    Animation intensity{' '}
                    <span className="tabular-nums text-text-secondary/70">
                      {pct(animationIntensity)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={10}
                    value={pct(animationIntensity)}
                    disabled={busy}
                    onChange={(e) => setAnimationIntensity(Number(e.target.value) / 100)}
                    className="h-3 w-full cursor-pointer appearance-none rounded-full bg-bg-tertiary disabled:cursor-not-allowed"
                  />
                </label>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-text-secondary">Paint</span>
                <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                  {(['all', 'abilities', 'weapons'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy}
                      onClick={() => setVfxTargets(t)}
                      className={segBtn(vfxTargets === t)}
                    >
                      {t === 'all' ? 'All' : t === 'abilities' ? 'Abilities' : 'Weapon FX'}
                    </button>
                  ))}
                </div>
              </div>

              {otherColorApplied && (
                <p className="text-[11px] text-amber-400/90">
                  {heroName} has an ability color applied in the Colors tab. Applying trippy VFX
                  replaces it (one recolor per hero).
                </p>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              disabled={busy || !dirty}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {applied && !dirty ? 'Applied' : tab === 'skin' ? 'Apply Skin' : 'Apply VFX'}
            </button>
            {applied && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>

          {busy && (
            <p className="text-[11px] text-text-secondary/80">
              Baking the paint. The first time for a given combination can take a while (it
              re-encodes the affected textures); the same combination is instant after that.
            </p>
          )}

          {actionError && (
            <div className="flex items-start gap-2 py-1 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="break-words">{actionError}</span>
            </div>
          )}

          {changed && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                gameRunning
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-border bg-bg-secondary/70 text-text-secondary'
              }`}
            >
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {gameRunning
                  ? 'Restart Deadlock for this change to take effect (addons mount at game start).'
                  : 'Saved. This paint mounts the next time you Launch Modded.'}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
