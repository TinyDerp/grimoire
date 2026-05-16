// Renderer-facing types for the Grimoire Social client surface. Wire-format
// types (ProfileSummary, LikeResponse, etc.) come from @grimoire/social-types
// — this file holds only the IPC-only shapes that don't cross the network.

import type { UserPublic } from '@grimoire/social-types';

/** Whether the session token survives an app restart on this OS.
 *  - 'os-keychain': stored via safeStorage backed by a real keychain.
 *  - 'session-only': in-memory only (Linux without libsecret, per ADR-011).
 */
export type SocialPersistenceMode = 'os-keychain' | 'session-only';

export interface SocialSessionStatus {
    signedIn: boolean;
    user: UserPublic | null;
    persistenceMode: SocialPersistenceMode;
    /** Unix seconds when the session expires, or null when signed out. */
    expiresAt: number | null;
}
