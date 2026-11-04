import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = (env.VITE_API_PROXY || env.VITE_API_URL || 'https://dristix.onrender.com').trim()

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy the API in development so the browser makes same-origin requests.
      // This sidesteps CORS entirely and keeps cookies working seamlessly on localhost.
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
