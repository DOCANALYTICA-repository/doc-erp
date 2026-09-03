/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // The API base URL defaults to the relative '/api/v1'. Proxying it here
      // means development matches the same-origin production topology, and no
      // request ever needs a CORS preflight in dev.
      proxy: {
        '/api/v1': {
          target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      // GSAP is used by the landing page alone, and Astryx is large and
      // changes rarely. Splitting both out keeps the dashboard chunks small
      // and lets the vendor chunks stay cached across deploys.
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            astryx: ['@astryxdesign/core'],
            gsap: ['gsap'],
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      globals: true,
    },
  };
});
