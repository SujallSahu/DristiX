/**
 * Access-token state for the API client, shared by the JSON and multipart
 * request helpers.
 *
 * The token is deliberately held in memory only. Persisting it would put a
 * bearer credential into localStorage, where any script on the page — and any
 * earlier XSS — could read it. The long-lived session lives in an httpOnly
 * refresh cookie that JavaScript cannot touch at all.
 */
import type { AuthResult } from '../../../shared/types';

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

export function notifySessionExpired(): void {
  token = null;
  expiredListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  });
}

export function getAccessToken(): string | null {
  return token;
}

/** Set by the data source after login/refresh. */
export function setAccessToken(next: string | null): void {
  token = next;
}

import { BASE_API_URL } from './apiUrl.js';

/**
 * Single-flight refresh: many parallel 401s must not trigger many refreshes.
 */
export async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE_API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        notifySessionExpired();
        return false;
      }
      const data = (await res.json()) as AuthResult;
      token = data.tokens.accessToken;
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
