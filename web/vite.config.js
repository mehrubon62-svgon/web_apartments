import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build output goes straight into ../frontend so FastAPI serves it unchanged.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: resolve(__dirname, '../frontend'),
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to FastAPI during `npm run dev`.
      '/auth': 'http://127.0.0.1:8000',
      '/users': 'http://127.0.0.1:8000',
      '/properties': 'http://127.0.0.1:8000',
      '/tours': 'http://127.0.0.1:8000',
      '/favorites': 'http://127.0.0.1:8000',
      '/history': 'http://127.0.0.1:8000',
      '/spatial-qa': 'http://127.0.0.1:8000',
      '/agent': 'http://127.0.0.1:8000',
      '/bookings': 'http://127.0.0.1:8000',
      '/pay': 'http://127.0.0.1:8000',
      '/purchase-requests': 'http://127.0.0.1:8000',
      '/conversations': 'http://127.0.0.1:8000',
      '/price-trackers': 'http://127.0.0.1:8000',
      '/recommendations': 'http://127.0.0.1:8000',
      '/complaints': 'http://127.0.0.1:8000',
      '/admin': 'http://127.0.0.1:8000',
      '/dashboard': 'http://127.0.0.1:8000',
      '/notifications': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
      '/media-files': 'http://127.0.0.1:8000',
      '/config.js': 'http://127.0.0.1:8000',
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
});
