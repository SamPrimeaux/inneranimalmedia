import path from 'path';
import fs from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

const analyze = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true';

function pickSupabaseEnv(env: Record<string, string>) {
  const url = (
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  const anonKey = (
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  return { url, anonKey };
}

/** Heavy vendors — split for caching; excalidraw isolated so lazy routes do not land in subset-shared. */
function manualChunkForNodeModule(id: string): string | undefined {
  // Keep Vite's dynamic-import helper out of vendor-* chunks (otherwise entry imports a 3MB+ file at boot).
  if (id.includes('vite/preload-helper')) return 'vite-preload';

  if (!id.includes('node_modules')) return undefined;

  if (id.includes('@supabase')) return 'vendor-supabase';
  if (/node_modules[/\\]@excalidraw[/\\]/.test(id)) return 'vendor-excalidraw';
  if (/node_modules[/\\](mermaid[/\\]|cytoscape)/.test(id)) return undefined;
  if (
    /node_modules[/\\]mermaid[/\\].*(?:[/\\]locale|[/\\]locales)[/\\]/i.test(id) ||
    /[/\\]locale[s]?[/\\][a-z]{2}-[A-Z]{2}/.test(id)
  ) {
    return 'vendor-locales';
  }
  if (id.includes('/three/') || id.includes('three/addons') || /[/\\]three[/\\]/.test(id)) {
    return 'vendor-three';
  }
  if (id.includes('katex')) return 'vendor-katex';
  if (id.includes('remotion') || id.includes('@remotion')) return 'vendor-remotion';
  if (id.includes('wardley') || id.includes('@ward')) return 'vendor-wardley';
  if (id.includes('/locale/') || id.includes('/locales/')) return 'vendor-locales';
  if (id.includes('@monaco-editor') || id.includes('monaco-editor')) return 'vendor-editor';
  if (
    id.includes('node_modules/react-dom') ||
    id.includes('node_modules/react-router') ||
    /node_modules[/\\]react[/\\]/.test(id)
  ) {
    return 'vendor-react';
  }
  if (id.includes('/recharts/') || /node_modules[/\\]recharts[/\\]/.test(id)) return 'vendor-charts';
  if (/node_modules[/\\]d3-[^/\\]+[/\\]/.test(id)) return 'vendor-charts';
  if (id.includes('lucide-react')) return 'vendor-icons';
  if (id.includes('framer-motion')) return 'vendor-motion';
  if (id.includes('@cloudflare/realtimekit') || id.includes('realtimekit')) return 'vendor-realtimekit';

  return undefined;
}

const HEAVY_PRELOAD_RE =
  /(?:^|[/])(?:vendor-(?:three|wardley|remotion|locales|katex|charts|excalidraw|realtimekit)|vite-preload|subset-shared\.chunk|ExcalidrawView|DesignStudioPage|MeetRealtimeKitShell)\.js/;

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '..');
  const env = {
    ...loadEnv(mode, repoRoot, ''),
    ...loadEnv(mode, __dirname, ''),
  };
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = pickSupabaseEnv(env);
  return {
    base: '/static/dashboard/app/',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': 'http://127.0.0.1:8787',
        '/assets': 'http://127.0.0.1:8787',
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        strategies: 'generateSW',
        filename: 'sw.js',
        manifestFilename: 'manifest.webmanifest',
        includeAssets: ['offline.html'],
        manifest: {
          name: 'IAM',
          short_name: 'IAM',
          description: 'Agent Sam workspace — build, deploy, and optimize.',
          start_url: '/dashboard/agent',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#000000',
          theme_color: '#000000',
          icons: [
            {
              src: '/static/dashboard/app/pwa/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/static/dashboard/app/pwa/apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/static/dashboard/app/pwa/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/static/dashboard/app/pwa/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['push-handler.js', 'sw-agent-cache.js'],
          skipWaiting: true,
          clientsClaim: true,
          /** HTML loads dashboard.js?v=… — must match precache entries without falling through to stale runtime cache. */
          ignoreURLParametersMatching: [/^v$/],
          globDirectory: 'dist',
          globPatterns: [
            'dashboard.js',
            'dashboard.css',
            'vendor-react.js',
            'vendor-icons.js',
            'pwa/*.png',
          ],
          globIgnores: [
            '**/vendor-excalidraw*.js',
            '**/vendor-realtimekit*.js',
            '**/vendor-three*.js',
            '**/vendor-remotion*.js',
            '**/vendor-wardley*.js',
            '**/bundle-stats.html',
          ],
          modifyURLPrefix: {
            '': '/static/dashboard/app/',
          },
          additionalManifestEntries: [
            { url: '/static/dashboard/shell.css', revision: null },
          ],
          navigateFallback: '/offline.html',
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/auth/,
            /^\/oauth\//,
            /^\/dashboard/,
            /^\/onboarding/,
          ],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.method !== 'GET' ||
                url.pathname.startsWith('/api/') ||
                url.pathname.startsWith('/auth/') ||
                url.pathname.startsWith('/oauth/'),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ url }) => /\/api\/agent\/(chat|plan)/i.test(url.pathname),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/static/dashboard/app/') && url.pathname.endsWith('.js'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'iam-dashboard-js-v2',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ url }) => url.origin.includes('fonts.gstatic.com'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'iam-fonts-v1',
                expiration: { maxEntries: 24, maxAgeSeconds: 365 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: ({ url }) =>
                url.pathname === '/static/dashboard/shell.css' ||
                (url.pathname.startsWith('/static/dashboard/app/') && url.pathname.endsWith('.css')),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'iam-dashboard-css-v1',
                expiration: { maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
      {
        name: 'restore-dashboard-shell-css-href',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            return html
              .replaceAll(
                '/static/dashboard/app/static/dashboard/shell.css',
                '/static/dashboard/shell.css',
              )
              .replaceAll('dashboard2.css', 'dashboard.css');
          },
        },
      },
      {
        name: 'iam-pwa-root-manifest-link',
        apply: 'build',
        enforce: 'post',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            let out = html.replace(
              '/static/dashboard/app/manifest.webmanifest',
              '/manifest.webmanifest',
            );
            if (!out.includes('name="theme-color"')) {
              out = out.replace(
                '<link rel="manifest"',
                '<meta name="theme-color" content="#2dd4bf" />\n  <link rel="manifest"',
              );
            }
            if (!out.includes('apple-touch-icon')) {
              out = out.replace(
                '<link rel="manifest"',
                '<link rel="apple-touch-icon" sizes="180x180" href="/static/dashboard/app/pwa/apple-touch-icon.png" />\n  <link rel="manifest"',
              );
            }
            if (!out.includes('apple-mobile-web-app-capable')) {
              out = out.replace(
                '<head>',
                '<head>\n  <meta name="apple-mobile-web-app-capable" content="yes" />\n  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n  <meta name="apple-mobile-web-app-title" content="IAM" />',
              );
            }
            return out;
          },
        },
      },
      {
        name: 'iam-purge-stale-dashboard-js-cache',
        apply: 'build',
        enforce: 'post',
        transformIndexHtml(html) {
          if (html.includes('iam-purge-stale-dashboard-js-cache')) return html;
          const purge =
            '<script id="iam-purge-stale-dashboard-js-cache">try{if("caches"in window){caches.delete("iam-dashboard-js-v1");}}catch(e){}</script>';
          return html.replace(
            /<script type="module" crossorigin src="\/static\/dashboard\/app\/dashboard\.js/,
            `${purge}\n  <script type="module" crossorigin src="/static/dashboard/app/dashboard.js`,
          );
        },
      },
      {
        name: 'defer-excalidraw-css-from-boot',
        apply: 'build',
        enforce: 'post',
        transformIndexHtml(html) {
          return html.replace(
            /\s*<link[^>]*href="[^"]*vendor-excalidraw\.css"[^>]*>\s*/gi,
            '\n',
          );
        },
      },
      {
        name: 'relocate-excalidraw-css-asset',
        apply: 'build',
        enforce: 'post',
        generateBundle(_options, bundle) {
          for (const [fileName, item] of Object.entries(bundle)) {
            if (item.type !== 'asset' || !fileName.endsWith('.css')) continue;
            const src =
              typeof item.source === 'string'
                ? item.source
                : Buffer.from(item.source as Uint8Array).toString('utf8');
            if (!src.includes('.excalidraw')) continue;
            delete bundle[fileName];
            this.emitFile({
              type: 'asset',
              fileName: 'assets/vendor-excalidraw.css',
              source: src,
            });
            break;
          }
        },
      },
      {
        name: 'merge-dashboard-entry-css',
        apply: 'build',
        enforce: 'post',
        generateBundle(_options, bundle) {
          const parts: Array<{ name: string; source: string }> = [];
          for (const [fileName, item] of Object.entries(bundle)) {
            if (item.type !== 'asset' || !fileName.endsWith('.css')) continue;
            if (fileName !== 'dashboard.css' && fileName !== 'dashboard2.css') continue;
            if (/excalidraw/i.test(fileName)) continue;
            const src = item.source;
            parts.push({
              name: fileName,
              source: typeof src === 'string' ? src : Buffer.from(src).toString('utf8'),
            });
            delete bundle[fileName];
          }
          if (!parts.length) return;
          parts.sort((a, b) => (a.name === 'dashboard.css' ? -1 : b.name === 'dashboard.css' ? 1 : 0));
          const merged = parts.map((p) => p.source).join('\n');
          this.emitFile({ type: 'asset', fileName: 'dashboard.css', source: merged });
        },
      },
      {
        name: 'rewrite-dashboard2-css-refs',
        apply: 'build',
        enforce: 'post',
        renderChunk(code) {
          if (!code.includes('dashboard2.css')) return null;
          return code.replaceAll('dashboard2.css', 'dashboard.css');
        },
        generateBundle(_options, bundle) {
          for (const item of Object.values(bundle)) {
            if (item.type === 'chunk' && item.code.includes('dashboard2.css')) {
              item.code = item.code.replaceAll('dashboard2.css', 'dashboard.css');
            } else if (
              item.type === 'asset' &&
              typeof item.source === 'string' &&
              item.source.includes('dashboard2.css')
            ) {
              item.source = item.source.replaceAll('dashboard2.css', 'dashboard.css');
            }
          }
        },
        writeBundle(options, bundle) {
          const outDir = options.dir || path.resolve(__dirname, 'dist');
          for (const fileName of Object.keys(bundle)) {
            if (!/\.(?:js|html|css)$/.test(fileName)) continue;
            const filePath = path.join(outDir, fileName);
            const raw = fs.readFileSync(filePath, 'utf8');
            if (!raw.includes('dashboard2.css')) continue;
            fs.writeFileSync(filePath, raw.replaceAll('dashboard2.css', 'dashboard.css'), 'utf8');
          }
        },
      },
      ...(analyze
        ? [
            visualizer({
              filename: 'dist/bundle-stats.html',
              gzipSize: true,
              brotliSize: true,
              open: false,
              template: 'treemap',
            }),
          ]
        : []),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: ['@excalidraw/excalidraw', 'remotion', '@remotion/player', 'mermaid'],
    },
    build: {
      minify: true,
      sourcemap: mode !== 'production',
      outDir: 'dist',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 600,
      modulePreload: {
        polyfill: false,
        resolveDependencies: (_filename, deps) => deps.filter((dep) => !HEAVY_PRELOAD_RE.test(dep)),
      },
      dynamicImportVarsOptions: {
        warnOnError: false,
      },
      rollupOptions: {
        input: {
          dashboard: path.resolve(__dirname, 'index.html'),
          'games-room': path.resolve(__dirname, 'entries/games-room.tsx'),
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === 'games-room') return 'games-room.js';
            return chunk.isEntry ? 'dashboard.js' : '[name].js';
          },
          chunkFileNames: '[name].js',
          assetFileNames: (asset) => {
            if (!asset.name?.endsWith('.css')) return '[name][extname]';
            const originals = asset.names ?? [];
            const fromExcalidraw = originals.some(
              (n) => /[/\\]@excalidraw[/\\]/.test(n) || /excalidraw/i.test(n),
            );
            const name = asset.name ?? '';
            if (fromExcalidraw) return 'assets/vendor-excalidraw[extname]';
            if (/LearnPage|learn\.css/i.test(name)) return 'assets/[name][extname]';
            const base = name.replace(/\.css$/i, '');
            if (base === 'index' || base === 'style' || base === 'dashboard' || base.startsWith('dashboard')) {
              return 'dashboard.css';
            }
            return 'assets/[name][extname]';
          },
          manualChunks: manualChunkForNodeModule,
        },
      },
    },
  };
});
