import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    // Served at /static/dashboard/agent/ by the Cloudflare worker
    base: '/static/dashboard/agent/',

    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },

    plugins: [react()],

    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    // Injected at build time by deploy scripts.
    // VITE_SHELL_VERSION  — from .sandbox-deploy-version via deploy-sandbox.sh
    // VITE_PRODUCT_LABEL  — used as <title> in index.html
    // VITE_LOGO_URL       — optional logo override (falls back to cms_tenants.logo_url)
    define: {
      'import.meta.env.VITE_SHELL_VERSION':  JSON.stringify(env.VITE_SHELL_VERSION  || 'dev-local'),
      'import.meta.env.VITE_PRODUCT_LABEL':  JSON.stringify(env.VITE_PRODUCT_LABEL  || 'Agent Sam'),
      'import.meta.env.VITE_LOGO_URL':       JSON.stringify(env.VITE_LOGO_URL       || ''),
    },

    optimizeDeps: {
      include: ['react', 'react-dom', '@excalidraw/excalidraw'],
    },

    build: {
      minify:    false,
      sourcemap: true,
      outDir:    'dist',
      rollupOptions: {
        input: path.resolve(__dirname, 'app/index.tsx'),
        output: {
          entryFileNames: 'agent-dashboard.js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name][extname]',
        },
      },
    },
  };
});
