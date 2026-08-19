import { defineConfig } from 'vite'
import { offlinePlugin } from './tools/vite-plugin-offline.js'

export default defineConfig({
  base: './',
  plugins: [offlinePlugin()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true, port: 5173 },
})
