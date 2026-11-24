import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * In production the taskpane and the API share an origin
 * (https://<host>/ooo/), so the app calls `api/vacation` relatively and no CORS
 * or base URL configuration is needed. The dev server proxies the same path to
 * the middleware so the two environments behave identically.
 */
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        taskpane: fileURLToPath(new URL('./taskpane.html', import.meta.url)),
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
