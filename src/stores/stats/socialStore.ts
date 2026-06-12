import { create } from 'zustand'
import type { EnemyStats, MateStats } from './types'
import { type Async, asyncIdle, asyncLoading, asyncLoaded, asyncError } from './async'

// Note: the API's party-stats endpoint was removed upstream (404 as of
// 2026-06-11), so this store covers mates and enemies only.

export interface SocialBundle {
    forAccountId: number | null
    enemies: EnemyStats[]
    mates: MateStats[]
}

const EMPTY: SocialBundle = { forAccountId: null, enemies: [], mates: [] }

// Minimum shared matches before an opponent/teammate is worth showing.
export const MIN_SHARED_MATCHES = 3

interface RawSteamProfile {
    account_id?: number
    personaname?: string
    avatar?: string
    avatarmedium?: string
}

interface SocialState {
    social: Async<SocialBundle>
    loadSocialStats: (accountId: number) => Promise<void>
}

function withRates<T extends { wins: number; matches_played: number }>(rows: T[]): T[] {
    return rows.map((r) => ({
        ...r,
        win_rate: r.matches_played > 0 ? (r.wins / r.matches_played) * 100 : 0,
    }))
}

export const useSocialStore = create<SocialState>((set, get) => ({
    social: asyncIdle<SocialBundle>(EMPTY),

    loadSocialStats: async (accountId) => {
        set((s) => ({ social: asyncLoading(s.social) }))
        try {
            // Each call is individually tolerant: one endpoint disappearing
            // upstream (it happened to party-stats) must not blank the tab.
            const [enemiesRaw, matesRaw] = await Promise.all([
                (window.electronAPI.stats.getEnemyStats(accountId) as Promise<EnemyStats[]>).catch(
                    () => null
                ),
                (window.electronAPI.stats.getMateStats(accountId) as Promise<MateStats[]>).catch(
                    () => null
                ),
            ])
            if (enemiesRaw === null && matesRaw === null) {
                throw new Error('Failed to load social stats from the Deadlock API')
            }

            // Pre-sort by shared matches so the profile lookup below covers
            // exactly the rows the UI will display first.
            const enemies = withRates(enemiesRaw ?? [])
                .filter((e) => e.matches_played >= MIN_SHARED_MATCHES)
                .sort((a, b) => b.matches_played - a.matches_played)
            const mates = withRates(matesRaw ?? [])
                .filter((m) => m.matches_played >= MIN_SHARED_MATCHES)
                .sort((a, b) => b.matches_played - a.matches_played)

            // Resolve persona names and avatars for the visible slice.
            const lookupIds = [
                ...new Set([
                    ...enemies.slice(0, 50).map((e) => e.enemy_id),
                    ...mates.slice(0, 50).map((m) => m.mate_id),
                ]),
            ]
            const profiles = new Map<number, { persona_name?: string; avatar_url?: string }>()
            if (lookupIds.length > 0) {
                try {
                    const raw = (await window.electronAPI.stats.getPlayerSteamProfiles(
                        lookupIds
                    )) as RawSteamProfile[]
                    for (const p of raw) {
                        if (p.account_id) {
                            profiles.set(p.account_id, {
                                persona_name: p.personaname,
                                avatar_url: p.avatarmedium || p.avatar,
                            })
                        }
                    }
                } catch {
                    // Names are decoration; rows still render with account IDs.
                }
            }

            if (get().social.status !== 'loading') return
            set({
                social: asyncLoaded({
                    forAccountId: accountId,
                    enemies: enemies.map((e) => ({ ...e, ...profiles.get(e.enemy_id) })),
                    mates: mates.map((m) => ({ ...m, ...profiles.get(m.mate_id) })),
                }),
            })
        } catch (err) {
            set((s) => ({ social: asyncError(s.social, err) }))
        }
    },
}))
