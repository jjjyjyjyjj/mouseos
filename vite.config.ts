import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // the Electron build loads dist/index.html over file://
  server: { port: 5183 },
})
