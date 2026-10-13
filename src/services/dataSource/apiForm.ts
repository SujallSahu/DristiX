/**
 * Multipart POST helper for the API client.
 *
 * Kept separate from `request()` because a FormData body must not have its
 * Content-Type set manually — the browser has to add the multipart boundary
 * itself, and forcing a header produces a body the server cannot parse.
 */
import { getAccessToken, refreshSession } from './apiToken.js';
import { BASE_API_URL } from './apiUrl.js';

export async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_API_URL}${path}`, {
    method: 'POST',
    headers,
    body: form,
    credentials: 'include',
  });

  if (res.status === 401) {
    if (await refreshSession()) return requestForm<T>(path, form);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}
