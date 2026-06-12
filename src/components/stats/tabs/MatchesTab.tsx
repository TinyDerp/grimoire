import { useMemo } from 'react'
import { Gamepad2 } from 'lucide-react'
import { Card } from '../../common/ui'
import { usePlayerStore } from '../../../stores/stats/playerStore'
import type { StoredMatch } from '../../../types/deadlock-stats'
import { MatchRow } from '../primitives'
import { winRateClass } from '../format'

function dayLabel(unixSeconds: number): string {
    const d = new Date(unixSeconds * 1000)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function MatchesTab() {
    const localMatchHistory = usePlayerStore((s) => s.playerData.data.localMatchHistory)

    const groups = useMemo(() => {
        const byDay: { label: string; matches: StoredMatch[] }[] = []
        for (const match of localMatchHistory) {
            const label = dayLabel(match.start_time)
            const last = byDay[byDay.length - 1]
            if (last && last.label === label) last.matches.push(match)
            else byDay.push({ label, matches: [match] })
        }
        return byDay
    }, [localMatchHistory])

    const wins = localMatchHistory.filter((m) => m.match_outcome === 'Win').length
    const rate = localMatchHistory.length > 0 ? (wins / localMatchHistory.length) * 100 : 0

    return (
        <Card
            title="Match History"
            icon={Gamepad2}
            description={
                localMatchHistory.length > 0
                    ? `Last ${localMatchHistory.length} recorded matches · ${wins}W ${localMatchHistory.length - wins}L`
                    : 'Matches recorded locally on each sync'
            }
            action={
                localMatchHistory.length > 0 ? (
                    <span className={`text-sm font-semibold ${winRateClass(rate)}`}>
                        {rate.toFixed(1)}% WR
                    </span>
                ) : undefined
            }
        >
            {localMatchHistory.length === 0 ? (
                <div className="text-center py-8 text-text-secondary">
                    <Gamepad2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No matches recorded yet</p>
                    <p className="text-xs mt-1">Use Refresh to sync this player's recent matches</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {groups.map((group) => (
                        <div key={group.label}>
                            <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">
                                {group.label}
                            </p>
                            <div className="space-y-2">
                                {group.matches.map((match) => (
                                    <MatchRow
                                        key={match.match_id}
                                        matchId={match.match_id}
                                        heroId={match.hero_id}
                                        outcome={match.match_outcome}
                                        kills={match.kills}
                                        deaths={match.deaths}
                                        assists={match.assists}
                                        durationS={match.duration_s}
                                        startTime={match.start_time}
                                        netWorth={match.net_worth}
                                        damage={match.player_damage}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}
