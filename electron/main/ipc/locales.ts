import { ipcMain } from 'electron';
import {
    downloadLanguage,
    fetchRemoteManifest,
    listDownloadedLanguages,
} from '../services/localeDownload';

ipcMain.handle('locales:getManifest', async () => {
    return fetchRemoteManifest();
});

ipcMain.handle('locales:listDownloaded', async () => {
    return listDownloadedLanguages();
});

ipcMain.handle('locales:download', async (_event, languageCode: string) => {
    return downloadLanguage(languageCode);
});
