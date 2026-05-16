// Login lifecycle for Grimoire Social. Owns the Steam OpenID BrowserWindow
// flow, persists the session token via Electron's ASYNC safeStorage API, and
// gates persistence on Linux per ADR-011: when no real secret store is
// available (gnome-libsecret / kwallet / Portal), refuse to persist; the user
// re-signs each launch.
//
// The session bearer itself lives in social.ts module memory and is set via
// social.setSessionToken. The renderer never imports either module; it talks
// to the social IPC handlers, which delegate here.

import { app, BrowserWindow, safeStorage } from 'electron';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { SocialPersistenceMode, SocialSessionStatus } from '../../../src/types/social';
import {
    getAuthBeginUrl,
    getMe,
    setSessionToken,
    logout as logoutOnServer,
    SocialApiError,
} from './social';

const SESSION_FILE_NAME = 'grimoire-social-session.enc';

interface PersistedSession {
    token: string;
    expires_at: number;
}

export type PersistenceMode = SocialPersistenceMode;
export type SessionStatus = SocialSessionStatus;

let cachedUser: SessionStatus['user'] = null;
let sessionExpiresAt: number | null = null;
let cachedAvailability: boolean | null = null;

const sessionEvents = new EventEmitter();

/** Subscribe to session changes (login, logout, hydrate, server-side
 *  invalidation). Returns an unsubscribe function. */
export function onSessionChanged(listener: (status: SessionStatus) => void): () => void {
    sessionEvents.on('change', listener);
    return () => sessionEvents.off('change', listener);
}

function emitChange(): void {
    sessionEvents.emit('change', getSessionStatus());
}

/** Whether safeStorage can persist a secret on this OS WITH a real keychain
 *  behind it. On Linux this returns false if the user has no libsecret /
 *  kwallet / Portal — we refuse to persist plaintext-equivalent. */
function canPersistSecurely(): boolean {
    if (cachedAvailability !== null) return cachedAvailability;
    if (!app.isReady()) {
        // Don't latch the answer before ready; on Linux availability isn't
        // knowable until after the ready event.
        return false;
    }
    if (!safeStorage.isEncryptionAvailable()) {
        cachedAvailability = false;
        return false;
    }
    if (process.platform === 'linux') {
        const backend = safeStorage.getSelectedStorageBackend();
        if (backend === 'basic_text' || backend === 'unknown') {
            cachedAvailability = false;
            return false;
        }
    }
    cachedAvailability = true;
    return true;
}

export function getPersistenceMode(): PersistenceMode {
    return canPersistSecurely() ? 'os-keychain' : 'session-only';
}

export function getSessionStatus(): SessionStatus {
    return {
        signedIn: cachedUser !== null,
        user: cachedUser,
        persistenceMode: getPersistenceMode(),
        expiresAt: sessionExpiresAt,
    };
}

function sessionFilePath(): string {
    return join(app.getPath('userData'), SESSION_FILE_NAME);
}

async function persistSession(shape: PersistedSession): Promise<void> {
    const encrypted = await safeStorage.encryptString(JSON.stringify(shape));
    await fs.writeFile(sessionFilePath(), encrypted);
}

async function clearPersistedSession(): Promise<void> {
    try {
        await fs.unlink(sessionFilePath());
    } catch {
        // No file or already gone — both fine.
    }
}

/** Restore an existing token from disk on app start. Called once from the
 *  app.whenReady() path. If decryption or /me both fail, the local session
 *  is cleared and the user is signed-out cleanly. */
export async function hydrateOnBoot(): Promise<void> {
    if (!canPersistSecurely()) return;
    let data: Buffer;
    try {
        data = await fs.readFile(sessionFilePath());
    } catch {
        return;
    }
    let shape: PersistedSession;
    try {
        const decrypted = await safeStorage.decryptString(data);
        shape = JSON.parse(decrypted) as PersistedSession;
    } catch (err) {
        console.warn('[socialAuth] Could not decrypt persisted session, clearing:', err);
        await clearPersistedSession();
        return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (!shape.token || shape.expires_at < nowSec + 60) {
        await clearPersistedSession();
        return;
    }
    setSessionToken(shape.token);
    sessionExpiresAt = shape.expires_at;
    try {
        const me = await getMe();
        cachedUser = me.user;
        emitChange();
    } catch (err) {
        if (err instanceof SocialApiError && err.status === 401) {
            // Server doesn't recognize the token any more; clean state.
            setSessionToken(null);
            sessionExpiresAt = null;
            await clearPersistedSession();
            return;
        }
        // Network error etc.: keep the token in memory (next /me call will
        // try again) but don't pretend we have a user yet.
        console.warn('[socialAuth] /me failed during hydrate; will retry on demand:', err);
    }
}

interface AuthCallbackParts {
    token: string;
    expiresAt: number;
}

function parseGrimoireAuthUrl(url: string): AuthCallbackParts | null {
    if (!url.toLowerCase().startsWith('grimoire://')) return null;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    // grimoire://auth/done?token=...&expires_at=... is the canonical shape.
    // Be lenient on which segment the OS gives us — host vs first path part
    // can vary slightly across platforms when an app handles the protocol.
    const segments = [parsed.host, ...parsed.pathname.split('/')].filter(Boolean);
    if (segments[0] !== 'auth' || segments[1] !== 'done') return null;
    const token = parsed.searchParams.get('token');
    if (!token) return null;
    const expRaw = parsed.searchParams.get('expires_at');
    const expiresAt = expRaw ? Number(expRaw) : NaN;
    return {
        token,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : defaultExpiry(),
    };
}

function defaultExpiry(): number {
    return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

/** Cheap recognizer for the main-process protocol dispatcher. */
export function isGrimoireAuthUrl(url: string): boolean {
    return parseGrimoireAuthUrl(url) !== null;
}

let activeLoginResolver:
    | { resolve: (parts: AuthCallbackParts) => void; reject: (err: Error) => void }
    | null = null;

/** Open a Steam OpenID login window as a child of the main window. Resolves
 *  when grimoire://auth/done?token=... is intercepted; rejects if the window
 *  closes first or the redirect URL is malformed. */
export async function login(parentWindow: BrowserWindow | null): Promise<SessionStatus> {
    if (activeLoginResolver) {
        throw new Error('A Grimoire Social login is already in progress');
    }

    const authWindow = new BrowserWindow({
        width: 720,
        height: 820,
        title: 'Sign in to Grimoire Social',
        parent: parentWindow ?? undefined,
        modal: parentWindow !== null,
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const result = await new Promise<AuthCallbackParts>((resolve, reject) => {
        activeLoginResolver = { resolve, reject };

        const handleRedirect = (event: Electron.Event, url: string): void => {
            const parts = parseGrimoireAuthUrl(url);
            if (!parts) return;
            event.preventDefault();
            if (activeLoginResolver) {
                activeLoginResolver.resolve(parts);
            }
            if (!authWindow.isDestroyed()) authWindow.close();
        };

        authWindow.webContents.on('will-redirect', handleRedirect);
        authWindow.webContents.on('will-navigate', handleRedirect);

        authWindow.on('closed', () => {
            if (activeLoginResolver) {
                activeLoginResolver.reject(new Error('Sign-in window was closed before completion'));
            }
        });

        authWindow.webContents.on('did-fail-load', (_e, _code, description, failingUrl) => {
            // Failed navigation to grimoire:// is expected and already handled
            // via will-redirect/will-navigate. Anything else is a real error.
            if (failingUrl && failingUrl.toLowerCase().startsWith('grimoire://')) return;
            console.warn('[socialAuth] Auth window did-fail-load:', description, failingUrl);
        });

        authWindow.loadURL(getAuthBeginUrl()).catch((err) => {
            if (activeLoginResolver) activeLoginResolver.reject(err);
            if (!authWindow.isDestroyed()) authWindow.close();
        });
    }).finally(() => {
        activeLoginResolver = null;
    });

    setSessionToken(result.token);
    sessionExpiresAt = result.expiresAt;
    if (canPersistSecurely()) {
        try {
            await persistSession({ token: result.token, expires_at: result.expiresAt });
        } catch (err) {
            console.warn('[socialAuth] Failed to persist session, continuing in-memory:', err);
        }
    }

    try {
        const me = await getMe();
        cachedUser = me.user;
    } catch (err) {
        // /me failed right after a successful auth — drop the token so the UI
        // doesn't pretend we're signed in.
        setSessionToken(null);
        sessionExpiresAt = null;
        await clearPersistedSession();
        emitChange();
        throw err;
    }

    emitChange();
    return getSessionStatus();
}

/** Local + remote sign-out. Best-effort calls /v1/auth/logout, then clears
 *  the persisted session file regardless of network result. */
export async function logout(): Promise<SessionStatus> {
    try {
        await logoutOnServer();
    } catch {
        // logoutOnServer already swallows expected errors; this is a safety net.
    }
    cachedUser = null;
    sessionExpiresAt = null;
    setSessionToken(null);
    await clearPersistedSession();
    emitChange();
    return getSessionStatus();
}

/** Called after a successful DELETE /v1/me so the local state matches.
 *  Distinct from logout() because the server has already invalidated. */
export async function clearLocalAfterAccountDeletion(): Promise<void> {
    cachedUser = null;
    sessionExpiresAt = null;
    setSessionToken(null);
    await clearPersistedSession();
    emitChange();
}

/** Handle a grimoire://auth/done URL that arrived via the OS protocol
 *  handler (cold-launch argv or second-instance event), as a fallback for
 *  cases where the in-window intercept didn't fire. */
export async function handleProtocolAuthCallback(url: string): Promise<void> {
    const parts = parseGrimoireAuthUrl(url);
    if (!parts) return;
    if (activeLoginResolver) {
        activeLoginResolver.resolve(parts);
        return;
    }
    setSessionToken(parts.token);
    sessionExpiresAt = parts.expiresAt;
    if (canPersistSecurely()) {
        try {
            await persistSession({ token: parts.token, expires_at: parts.expiresAt });
        } catch (err) {
            console.warn('[socialAuth] Failed to persist OS-callback session:', err);
        }
    }
    try {
        const me = await getMe();
        cachedUser = me.user;
        emitChange();
    } catch (err) {
        setSessionToken(null);
        sessionExpiresAt = null;
        await clearPersistedSession();
        emitChange();
        console.warn('[socialAuth] /me failed after OS-callback auth:', err);
    }
}
