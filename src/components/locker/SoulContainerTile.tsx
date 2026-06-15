import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { Loader2 } from 'lucide-react';
import { getSoulModelInfo, exportSoulModel } from '../../lib/api';
import { loadGltfPreview } from '../../lib/loadGltfPreview';
import { buildNormalizedRoot, disposeScene, meshUrlFor } from './soulModel';
import { useSoulRegistry } from './soulRegistry';

/**
 * One soul-container card's 3D preview, for the Locker's Global view.
 *
 * Unlike a normal viewer this mounts NO canvas of its own: it loads the GLB
 * (produced on demand by the bundled `vpkmerge model export` via
 * exportSoulModel, served over the privileged `grimoire-soul:` scheme) and
 * registers a normalized group with the shared SoulContainerCanvas, which draws
 * every card through a single WebGL context. That's what stops a large grid
 * from exhausting the browser's live-context cap and blanking cards white.
 *
 * The whole Locker card is the enable/disable control, so the track element is
 * pointer-events-none; clicks pass through to toggle the mod. On any failure it
 * renders nothing, leaving the card's clear window.
 */
export default function SoulContainerTile({
  modKey,
}: {
  /** The mod's metaKey: the collision-safe storage/URL key and the source the
   *  main process resolves and exports from. Folder-qualified for overflow
   *  mods (`addons{N}/<file>`), a bare filename for base-addons/.disabled. */
  modKey: string;
}) {
  const registry = useSoulRegistry();
  const trackRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // modKey is stable for a card instance; register the track element so the
    // shared canvas can measure this card even before the GLB has loaded.
    registry.register(modKey, el);

    let cancelled = false;
    let root: THREE.Group | null = null;

    (async () => {
      try {
        let info = await getSoulModelInfo(modKey);
        if (!info.hasModel) {
          if (cancelled) return;
          setGenerating(true);
          info = await exportSoulModel(modKey);
          if (cancelled) return;
          setGenerating(false);
        }
        if (!info.hasModel) {
          if (!cancelled) setFailed(true);
          return;
        }
        const url = meshUrlFor(modKey, info.mtimeMs);
        const gltf = await loadGltfPreview(url);
        if (cancelled) {
          disposeScene(gltf.scene);
          return;
        }
        root = buildNormalizedRoot(gltf.scene);
        registry.setRoot(modKey, root);
      } catch {
        if (!cancelled) {
          setGenerating(false);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      // Drop from the map first so the render loop can't touch a disposed group.
      registry.unregister(modKey);
      if (root) disposeScene(root);
    };
  }, [modKey, registry]);

  // Failure: render nothing so the card's clear window shows.
  if (failed) return null;

  // The track element always renders (even before load) so the shared canvas
  // has a rect to scissor into once the model is ready.
  return (
    <div ref={trackRef} className="pointer-events-none absolute inset-0">
      {generating && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="h-5 w-5 animate-spin text-white/80" />
        </div>
      )}
    </div>
  );
}
