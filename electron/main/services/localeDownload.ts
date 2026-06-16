import { app } from 'electron';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DownloadedLocale, LocaleManifest } from '../../../src/types/locales';

/**
 * Downloadable language packs.
 *
 * English ships bundled in the app; every other language lives only on GitHub
 * `main`. This service fetches the manifest (the language index the picker reads)
 * and individual catalogs from raw.githubusercontent.com, caching each downloaded
 * catalog under userData/locales/<code>/translation.json so it works offline on
 * the next launch.
 *
 * No auth and no telemetry: these are plain GETs of public repo files.
 */

/** Repo + branch the catalogs are read from. Overridable for tests/forks. */
const RAW_BASE =
  process.env.GRIMOIRE_LOCALE_BASE_URL ??
  'https://raw.githubusercontent.com/Slush97/grimoire/main';

const MANIFEST_URL = `${RAW_BASE}/src/locales/manifest.json`;
const catalogUrl = (code: string) => `${RAW_BASE}/src/locales/${code}/translation.json`;

const DEFAULT_TIMEOUT_MS = 15_000;
/** Refuse absurdly large payloads (a full catalog is well under this). */
const MAX_BYTES = 5 * 1024 * 1024;

/** BCP 47-ish: 2-3 letter language, optional script/region subtag. Anchored so a
 *  code can never escape the locales directory (no slashes, dots, or '..'). */
const CODE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export class LocaleDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocaleDownloadError';
  }
}

function assertValidCode(code: string): void {
  if (!CODE_RE.test(code)) {
    throw new LocaleDownloadError(`Invalid language code: ${code}`);
  }
}

function localesRoot(): string {
  return join(app.getPath('userData'), 'locales');
}

function cachePath(code: string): string {
  return join(localesRoot(), code, 'translation.json');
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LocaleDownloadError('Request timed out');
    }
    throw new LocaleDownloadError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new LocaleDownloadError(`HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) {
    throw new LocaleDownloadError('Payload too large');
  }
  return text;
}

/** Parse and lightly validate a catalog: it must be a JSON object. */
function parseCatalog(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LocaleDownloadError('Catalog is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LocaleDownloadError('Catalog is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Fetch the language index from GitHub `main`. Throws if offline/unreachable;
 *  the renderer falls back to its bundled manifest copy. */
export async function fetchRemoteManifest(): Promise<LocaleManifest> {
  const text = await fetchText(MANIFEST_URL);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LocaleDownloadError('Manifest is not valid JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as LocaleManifest).languages)
  ) {
    throw new LocaleDownloadError('Manifest is malformed');
  }
  return parsed as LocaleManifest;
}

/** Download a language's catalog and cache it for offline use. */
export async function downloadLanguage(code: string): Promise<DownloadedLocale> {
  assertValidCode(code);
  const text = await fetchText(catalogUrl(code));
  const catalog = parseCatalog(text);
  const dest = cachePath(code);
  await mkdir(join(localesRoot(), code), { recursive: true });
  await writeFile(dest, JSON.stringify(catalog), 'utf8');
  return { code, catalog };
}

/** Every language already cached to disk, for startup hydration. */
export async function listDownloadedLanguages(): Promise<DownloadedLocale[]> {
  let entries;
  try {
    entries = await readdir(localesRoot(), { withFileTypes: true });
  } catch {
    return []; // no locales dir yet: nothing downloaded
  }
  const out: DownloadedLocale[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !CODE_RE.test(entry.name)) continue;
    try {
      const text = await readFile(cachePath(entry.name), 'utf8');
      out.push({ code: entry.name, catalog: parseCatalog(text) });
    } catch {
      // Skip an unreadable/corrupt cache entry rather than failing the whole list.
    }
  }
  return out;
}
