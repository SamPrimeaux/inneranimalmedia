import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Self-contained ES module for the CMS studio iframe (React bundled in). */
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, '..'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/cms'),
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'main.tsx'),
      output: {
        format: 'es',
        entryFileNames: 'cms-editor.js',
        inlineDynamicImports: true,
      },
    },
  },
});
