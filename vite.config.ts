import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the site from /doc-signing-app/, so production builds use that base path.
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/doc-signing-app/' : '/',
  plugins: [react()],
}))
