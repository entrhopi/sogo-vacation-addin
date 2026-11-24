import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Served from a subpath (https://<host>/ooo/), so every asset URL must stay
 * relative: with the default "/", the app requests /assets/... from the host
 * root and never boots.
 *
 * The app calls `api/vacation` relatively, so production is same-origin. The
 * dev server proxies the same path to the middleware to keep both identical.
 */
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
})
