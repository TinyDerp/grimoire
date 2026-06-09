import { app } from 'electron';

// Identify outbound API/asset requests as Grimoire so GameBanana and
// deadlock-api can see the traffic comes from the mod manager (GameBanana tool
// 22583) rather than an anonymous client. Computed once; app.getVersion() reads
// the bundled package version and is safe to call before the app is ready.
function resolveAppVersion(): string {
    try {
        return app.getVersion();
    } catch {
        return '0.0.0';
    }
}

export const GRIMOIRE_USER_AGENT = `Grimoire/${resolveAppVersion()} (Deadlock mod manager; +https://grimoiremods.com)`;
