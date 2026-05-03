import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

const analyze = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/static/dashboard/agent/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
            '/api': 'http://127.0.0.1:8787'
        }
      },
      plugins: [
        react(),
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
        include: ['react', 'react-dom', '@excalidraw/excalidraw'],
      },
      build: {
        minify: true,
        sourcemap: true,
        outDir: 'dist',
        rollupOptions: {
          output: {
            entryFileNames: 'agent-dashboard.js',
            chunkFileNames: '[name].js',
            assetFileNames: (assetInfo) => {
              if (assetInfo.name?.endsWith('.css')) return 'agent-dashboard.css';
              return '[name][extname]';
            }
          }
        }
      }
    };
});
