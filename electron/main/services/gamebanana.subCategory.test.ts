import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    BrowserWindow: class BrowserWindow {
        static getAllWindows() { return []; }
    },
}));
vi.mock('./modDatabase', () => ({
    getCachedCategoryTree: vi.fn(),
    saveCachedCategoryTree: vi.fn(),
}));
vi.mock('./modRequirementCache', () => ({ cacheRequirements: vi.fn() }));

import { fetchModDetails, fetchSubmissions } from './gamebanana';

// Trimmed from the live Mod/Index list response on 2026-10-16. The list
// endpoint gives both categories as name + profile URL and no _idRow, and sends
// _aSubCategory as null for a mod filed directly under its root category.
const payload = {
    _aMetadata: { _nRecordCount: 2, _nPerpage: 50, _bIsComplete: true },
    _aRecords: [
        {
            _idRow: 681048,
            _sName: 'Graves -> Ashley Graves',
            _sProfileUrl: 'https://gamebanana.com/mods/681048',
            _tsDateAdded: 1790000000,
            _tsDateModified: 1790000001,
            _nLikeCount: 3,
            _nViewCount: 40,
            _bHasFiles: true,
            _aRootCategory: { _sName: 'Skins', _sProfileUrl: 'https://gamebanana.com/mods/cats/33295', _sIconUrl: '' },
            _aSubCategory: {
                _sName: 'Graves',
                _sProfileUrl: 'https://gamebanana.com/mods/cats/42674',
                _sIconUrl: 'https://images.gamebanana.com/img/ico/ModCategory/69959cf637664.png',
            },
        },
        {
            _idRow: 700001,
            _sName: 'Silver crosshair',
            _sProfileUrl: 'https://gamebanana.com/mods/700001',
            _tsDateAdded: 1790000010,
            _tsDateModified: 1790000011,
            _nLikeCount: 1,
            _nViewCount: 9,
            _bHasFiles: true,
            _aRootCategory: { _sName: 'HUD', _sProfileUrl: 'https://gamebanana.com/mods/cats/31713', _sIconUrl: '' },
            _aSubCategory: null,
        },
    ],
};

describe('fetchSubmissions sub-category', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the sub-category id from its profile URL and leaves a root-only mod without one', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const { records } = await fetchSubmissions('Mod', 1, 50);

        expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('_aSubCategory');
        expect(records[0].rootCategory?.name).toBe('Skins');
        expect(records[0].subCategory).toMatchObject({ id: 42674, name: 'Graves' });
        expect(records[1].subCategory).toBeUndefined();
    });
});

describe('GameBanana embedded videos', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('loads YouTube media through the existing details request', async () => {
        const fetch = vi.fn(async () => Response.json({
            _idRow: 726099,
            _aEmbeddedMedia: [
                'https://www.youtube.com/watch?v=qOwaOVo5lmw',
                'https://www.youtube.com/watch?v=AJKwHiwLp28&t=3s',
                'https://youtu.be/qOwaOVo5lmw',
                'https://example.com/not-a-video',
            ],
        }));
        vi.stubGlobal('fetch', fetch);
        expect((await fetchModDetails(726099)).youtubeVideoIds).toEqual(['qOwaOVo5lmw', 'AJKwHiwLp28']);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain('_aEmbeddedMedia');
    });

    it.each(['Sound', 'Wip'])('handles absent videos in %s submissions without unsupported fields', async section => {
        const fetch = vi.fn(async () => Response.json({ _idRow: 1, _aEmbeddedMedia: null }));
        vi.stubGlobal('fetch', fetch);
        expect((await fetchModDetails(1, section)).youtubeVideoIds).toEqual([]);
        const url = String((fetch.mock.calls[0] as unknown[])[0]);
        expect(url.includes('_aEmbeddedMedia')).toBe(section !== 'Sound');
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
