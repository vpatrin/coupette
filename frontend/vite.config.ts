import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envDir: path.resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Ports from the environment for parallel worktrees; defaults match main.
    port: Number(process.env.FRONTEND_PORT || 5173),
    allowedHosts: true,
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || 8001}`,
        changeOrigin: true,
      },
    },
  },
})
