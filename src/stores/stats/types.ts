// Renderer-side shapes for stats IPC results. The stats IPC surface returns
// `unknown`, so these mirror what electron/main/services/stats.ts actually
// produces (post-transform). The nested HeroCounterStats/HeroSynergyStats/
// Build interfaces in src/types/deadlock-stats.ts describe shapes the service
// does NOT return; do not use them for IPC results.

export interface SteamUser {
    steamId64: string
    accountId: number
    personaName: string
    mostRecent: boolean
}

// From /v1/players/{id}/enemy-stats and /mate-stats (service passthrough),
// enriched in socialStore with Steam profile names and computed win rates.
export interface EnemyStats {
    enemy_id: number
    wins: number
    matches_played: number
    matches: number[]
    persona_name?: string
    avatar_url?: string
    win_rate?: number
}

export interface MateStats {
    mate_id: number
    wins: number
    matches_played: number
    matches: number[]
    persona_name?: string
    avatar_url?: string
    win_rate?: number
}

// PartyStats removed: the /v1/players/{id}/party-stats endpoint was removed
// upstream (404 as of 2026-06-11).

// (Counter/synergy/comb-stats, badge-distribution, and builds shapes lived
// here while the Analytics/Meta/Builds tabs existed; removed with those tabs.
// The IPC surface for them remains in electron/main if they come back.)
