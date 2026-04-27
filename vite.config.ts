import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel deployment base path
const base = process.env.NODE_ENV === 'production' ? '/' : '/'

export default defineConfig({
  plugins: [react()],
  base: base,
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild'
  },
  server: {
    port: 5173,
    open: true
  }
})
