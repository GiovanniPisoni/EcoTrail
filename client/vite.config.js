import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    // leaflet.markercluster's UMD build can otherwise end up bundled against a second,
    // separate copy of leaflet: its markers then don't share Leaflet's own map instance
    // internals (e.g. the zoom animation hook), which is why they used to sit frozen in
    // place during a zoom gesture instead of tracking the map like the trail lines do.
    dedupe: ['leaflet']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
