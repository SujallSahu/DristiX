/**
 * Access-token and refresh-token state for the API client, shared by the JSON
 * and multipart request helpers.
 *
 * Implements dual-strategy session persistence:
 * 1. HTTP-only refresh cookie (for seamless same-origin / supported browser sessions)
 * 2. Encrypted/fallback localStorage tokens (to guarantee session survival across page
 *    reloads, mobile browsers, and cross-site privacy sandbox / third-party cookie restrictions).
 */
import type { AuthResult, UserProfile } from '../../../shared/types';
import { BASE_API_URL } from './apiUrl.js';

const ACCESS_TOKEN_KEY = 'dristix_auth_access_token';
const REFRESH_TOKEN_KEY = 'dristix_auth_refresh_token';
const SESSION_USER_KEY = 'dristix_auth_user';

let token: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

type SessionExpiredCallback = () => void;
const expiredListeners: SessionExpiredCallback[] = [];

export function onSessionExpired(cb: SessionExpiredCallback): () => void {
  expiredListeners.push(cb);
  return () => {
    const idx = expiredListeners.indexOf(cb);
    if (idx >= 0) expiredListeners.splice(idx, 1);
  };
}

export function clearSessionTokens(): void {
  token = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(SESSION_USER_KEY);
    } catch {
      /* ignore storage errors */
    }
  }
}

export function notifySessionExpired(): void {
  clearSessionTokens();
  expiredListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  });
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredRefreshToken(refreshToken: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    /* ignore storage quota */
  }
}

export function getStoredSessionUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function setStoredSessionUser(user: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
    }
  } catch {
    /* ignore storage quota */
  }
}

export function getAccessToken(): string | null {
  if (token) return token;
  const stored = getStoredAccessToken();
  if (stored) {
    token = stored;
    return stored;
  }
  return null;
}

/** Set by the data source after login/refresh. */
export function setAccessToken(next: string | null): void {
  token = next;
  if (typeof window !== 'undefined') {
    try {
      if (next) {
        localStorage.setItem(ACCESS_TOKEN_KEY, next);
      } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      }
    } catch {
      /* ignore storage quota */
    }
  }
}

/**
 * Single-flight refresh: many parallel 401s must not trigger many refreshes.
 */
export async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const storedRefreshToken = getStoredRefreshToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (storedRefreshToken) {
        headers['x-refresh-token'] = storedRefreshToken;
      }

      const res = await fetch(`${BASE_API_URL}/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          refreshToken: storedRefreshToken || undefined,
        }),
      });

      if (!res.ok) {
        notifySessionExpired();
        return false;
      }

      const data = (await res.json()) as AuthResult;
      setAccessToken(data.tokens.accessToken);
      if (data.tokens.refreshToken) {
        setStoredRefreshToken(data.tokens.refreshToken);
      }
      if (data.user) {
        setStoredSessionUser(data.user);
      }
      return true;
    } catch {
      notifySessionExpired();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
