import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // the Electron build loads dist/index.html over file://
  build: { target: 'esnext' }, // Chromium-only; we use top-level await
  server: { port: 5183 },
})
