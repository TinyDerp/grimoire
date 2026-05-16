import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// Bake the social Worker URL at build time so packaged releases have a stable
// endpoint. Override via env var at build (CI sets prod URL); dev runs default
// to wrangler's local port. Substituted into the main bundle by Vite's define.
const SOCIAL_BASE_URL = process.env['GRIMOIRE_SOCIAL_BASE_URL'] ?? 'http://localhost:8787';

export default defineConfig({
    main: {
        plugins: [
            externalizeDepsPlugin({
                // @grimoire/social-types is a workspace package whose entrypoint is a
                // .ts file shipped from source. The main process can't `require()` it
                // at runtime, so bundle it. zod stays externalized (CJS, Node-loadable).
                exclude: ['electron-updater', 'electron-log', '@grimoire/social-types'],
            }),
        ],
        define: {
            'process.env.GRIMOIRE_SOCIAL_BASE_URL': JSON.stringify(SOCIAL_BASE_URL),
        },
        build: {
            outDir: 'dist/main',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'electron/main/index.ts'),
                },
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'dist/preload',
            lib: {
                entry: resolve(__dirname, 'electron/preload/index.ts'),
                formats: ['cjs'],
                fileName: () => 'index.js',
            },
            rollupOptions: {
                external: ['electron'],
            },
        },
    },
    renderer: {
        root: '.',
        base: './',
        build: {
            outDir: 'dist/renderer',
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'index.html'),
                },
            },
        },
        plugins: [react(), tailwindcss()],
        server: {
            host: '127.0.0.1',
            port: 5173,
        },
    },
});
