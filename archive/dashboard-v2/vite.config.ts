import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isGhPages = process.env.GH_PAGES === 'true';

    return {
      base: isGhPages ? '/inneranimalmedia/' : '/static/dashboard-v2/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
            '/api': 'http://127.0.0.1:8787'
        }
      },
      plugins: [react()],
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
        minify: false,
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
