import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
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
            '/api': 'http://127.0.0.1:8787'
        }
      },
      plugins: [
        react(),
        // Vite joins `base` with root-absolute `/static/dashboard/shell.css` → broken
        // `/static/dashboard/app/static/dashboard/shell.css`. Shell is served from R2 at
        // `static/dashboard/shell.css` (site path `/static/dashboard/shell.css`), not under app.
        {
          name: 'restore-dashboard-shell-css-href',
          enforce: 'post',
          transformIndexHtml(html) {
            return html.replaceAll(
              '/static/dashboard/app/static/dashboard/shell.css',
              '/static/dashboard/shell.css',
            );
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
        }
      },
      optimizeDeps: {
        include: ['react', 'react-dom', '@excalidraw/excalidraw', 'remotion', '@remotion/player'],
      },
      build: {
        minify: true,
        sourcemap: true,
        outDir: 'dist',
        // Large vendor libs + shared; use ANALYZE=1 on dashboard for entry/subset-shared.
        chunkSizeWarningLimit: 600,
        rollupOptions: {
          output: {
            entryFileNames: 'agent-dashboard.js',
            chunkFileNames: '[name].js',
            assetFileNames: (assetInfo) => {
              if (assetInfo.name?.endsWith('.css')) return 'agent-dashboard.css';
              return '[name][extname]';
            },
            // Wardley map chunks are lazy-loaded from mermaid internals (no separate `wardley` package).
            manualChunks: {
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              'vendor-editor': ['@monaco-editor/react'],
              'vendor-mermaid': ['mermaid'],
              'vendor-three': ['three'],
              'vendor-cytoscape': ['cytoscape'],
              'vendor-katex': ['katex'],
              'agent-core': ['./components/ChatAssistant', './components/McpPage'],
              'settings': ['./components/settings/SettingsPanel'],
              'learn': ['./components/LearnPage'],
              'studio': ['./components/DesignStudioPage'],
              'vendor-remotion': ['remotion', '@remotion/player'],
            },
          }
        }
      }
    };
});
