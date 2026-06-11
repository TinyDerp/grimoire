// Renderer-facing types for the Deadworks custom-server browser.
//
// These mirror the grimoire-relay wire contract
// (grimoire-relay/src/shared/schemas.ts). The relay's Zod schemas are the
// single source of truth; keep these additive and in sync.

export type DeadworksVisibility = 'public' | 'unlisted' | 'private' | 'password';
export type DeadworksContentKind = 'map' | 'addon';

export interface DeadworksPlayer {
    name: string;
    hero: string;
    team: number;
    kills: number;
    deaths: number;
    assists: number;
    level: number;
}

export interface DeadworksMod {
    name: string;
    type: string;
    version: string;
}

export interface DeadworksContentItem {
    filename: string;
    kind: DeadworksContentKind;
    version: number;
    compressed_size: number;
    download_url: string;
}

export interface DeadworksServer {
    id: string;
    name: string;
    address: string;
    raw_address: string;
    region: string;
    online: boolean;
    player_count: number;
    max_players: number;
    version: string;
    visibility: DeadworksVisibility;
    password_protected: boolean;
    map: string;
    players: DeadworksPlayer[];
    mods: DeadworksMod[];
    content_addons: string[];
    extra_maps: string[];
    content?: DeadworksContentItem[];
    last_heartbeat: string | null;
}

/** Live ping result for one server, keyed by id, surfaced in the browser list. */
export interface DeadworksPing {
    id: string;
    /** Round-trip ms, or -1 when the server did not answer the A2S query. */
    ms: number;
}

/** Progress phases emitted while preparing a connect. `status` widens over the
 *  download lifecycle: fetching -> checking -> downloading -> decompressing ->
 *  ready -> connecting. */
export interface DeadworksConnectProgress {
    name: string;
    status:
        | 'fetching'
        | 'checking'
        | 'downloading'
        | 'decompressing'
        | 'ready'
        | 'connecting';
    bytesDownloaded: number;
    totalBytes: number;
    itemIndex: number;
    totalItems: number;
}

export interface DeadworksConnectResult {
    success: boolean;
    method: string;
    message: string;
}

export interface DeadworksRelayStats {
    servers_online: number;
    players_online: number;
    relay_version: string;
}
