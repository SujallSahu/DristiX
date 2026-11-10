import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawTarget = (env.VITE_API_PROXY || env.VITE_API_URL || '').trim()
  const isPlaceholder = !rawTarget || rawTarget.includes('your-service-name') || rawTarget.includes('example.com') || rawTarget.includes('<')
  const proxyTarget = isPlaceholder ? 'https://dristix.onrender.com' : rawTarget

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
          configure: (proxy) => {
            proxy.on('error', (err, req) => {
              console.warn(`[vite proxy error] ${req.method} ${req.url} -> ${proxyTarget}: ${err.message}`)
            })
          },
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
          configure: (proxy) => {
            proxy.on('error', (err, req) => {
              console.warn(`[vite preview proxy error] ${req.method} ${req.url} -> ${proxyTarget}: ${err.message}`)
            })
          },
        },
      },
    },
  }
})
