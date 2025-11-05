import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/playbox-timer/', // Ganti dengan nama repo Anda
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
