import { create } from 'zustand'
import {
    HERO_NAMES,
    EXPERIMENTAL_HERO_IDS,
    type HeroAsset,
    type RankAsset,
} from '../../types/deadlock-stats'

// Hero roster + rank ladder from the assets API (via stats:getHeroes /
// stats:getRanks, cached in main). This is the single naming/filtering
// authority for every Stats surface: stored hero_name values stamped by old
// syncs are unreliable (the static map they came from had drifted), so render
// hero identity from hero_id only.

export type HeroMap = Record<number, HeroAsset>
export type RankMap = Record<number, RankAsset>

interface HeroState {
    byId: HeroMap
    ranks: RankMap
    status: 'idle' | 'loading' | 'loaded' | 'error'
    loadHeroes: () => Promise<void>
}

export const useHeroStore = create<HeroState>((set, get) => ({
    byId: {},
    ranks: {},
    status: 'idle',

    loadHeroes: async () => {
        const { status } = get()
        if (status === 'loading' || status === 'loaded') return
        set({ status: 'loading' })
        const [heroes, ranks] = await Promise.all([
            (window.electronAPI.stats.getHeroes() as Promise<HeroAsset[]>).catch(() => null),
            (window.electronAPI.stats.getRanks() as Promise<RankAsset[]>).catch(() => null),
        ])
        const byId: HeroMap = {}
        for (const hero of heroes ?? []) byId[hero.id] = hero
        const rankMap: RankMap = {}
        for (const rank of ranks ?? []) rankMap[rank.tier] = rank
        // Offline (both null): helpers fall back to the static HERO_NAMES map.
        set({ byId, ranks: rankMap, status: heroes || ranks ? 'loaded' : 'error' })
    },
}))

export function heroDisplayName(byId: HeroMap, heroId: number): string {
    return byId[heroId]?.name ?? HERO_NAMES[heroId] ?? `Hero ${heroId}`
}

/** Hook for hero display names; single naming source for all Stats surfaces. */
export function useHeroName(): (heroId: number) => string {
    const byId = useHeroStore((s) => s.byId)
    return (heroId: number) => heroDisplayName(byId, heroId)
}

/** Remote icon for heroes whose chip icon is not bundled (brand-new heroes). */
export function heroRemoteIcon(byId: HeroMap, heroId: number): string | null {
    return byId[heroId]?.icon_url ?? null
}

/**
 * Test/in-development heroes (Gunslinger, hero_testhero, hero-labs drafts)
 * leak into API hero lists; hide them everywhere. Disabled-but-real heroes
 * (Kali) are NOT hidden: players legitimately have history on them.
 */
export function isTestHero(byId: HeroMap, heroId: number): boolean {
    const asset = byId[heroId]
    if (asset) return asset.in_development
    return EXPERIMENTAL_HERO_IDS.has(heroId) || !(heroId in HERO_NAMES)
}
