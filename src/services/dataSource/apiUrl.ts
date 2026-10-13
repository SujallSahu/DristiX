/**
 * Normalizes the backend API base endpoint URL.
 *
 * In production builds (e.g. Vercel):
 * - If VITE_API_URL is set, it uses that URL.
 * - If VITE_API_URL is omitted (e.g. on free Vercel without configuring env vars),
 *   it automatically defaults to the production Render backend:
 *   https://dristix.onrender.com
 *   This means NO environment variables or paid upgrades are needed on Vercel!
 *
 * In development (npm run dev):
 * - Defaults to '/api' to use Vite's local dev server proxy (http://localhost:4000).
 */
const isProd = import.meta.env.PROD;
const fallbackUrl = isProd ? 'https://dristix.onrender.com' : '/api';
const rawUrl = (import.meta.env.VITE_API_URL || fallbackUrl).trim();

const origin = rawUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');

export const BASE_API_URL = origin ? `${origin}/api` : '/api';
