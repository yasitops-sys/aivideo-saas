import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from /admin/ in production — keep the customer app untouched.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
