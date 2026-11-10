/**
 * Normalizes the backend API base endpoint URL.
 *
 * In production builds (e.g. Vercel):
 * - If VITE_API_URL is set, it uses that URL.
 * - If VITE_API_URL is omitted (e.g. on free Vercel without configuring env vars),
 *   it automatically defaults to the production Render backend:
 *   https://dristix.onrender.com
 *
 * In development / localhost testing (npm run dev or vite preview):
 * - Always routes through '/api' using Vite's proxy.
 *   This avoids CORS preflight blocks, Cross-Origin-Resource-Policy blocks,
 *   and browser third-party cookie restrictions during localhost testing!
 */
const isProd = import.meta.env.PROD;

const isLocalhost =
  typeof window !== 'undefined' &&
  Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1' ||
    window.location.hostname.endsWith('.localhost')
  );

const shouldUseProxy = !isProd || isLocalhost;

const prodFallback = 'https://dristix.onrender.com';
const envUrl = (import.meta.env.VITE_API_URL || '').trim();
const isPlaceholder = !envUrl || envUrl.includes('your-service-name') || envUrl.includes('example.com') || envUrl.includes('<');
const rawUrl = isPlaceholder ? prodFallback : envUrl;
const origin = rawUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');

export const BASE_API_URL = shouldUseProxy ? '/api' : (origin ? `${origin}/api` : '/api');
