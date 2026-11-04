import { create } from 'zustand';
import { getDataSource } from '../services/dataSource';
import { useAuthStore } from '../store/useAuthStore';
import type { UserProfile } from '../../shared/types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface BootstrapState {
  status: Status;
  error: string | null;
  mode: 'local' | 'api';
  session: UserProfile | null;

  run: () => Promise<void>;
  setSession: (user: UserProfile | null) => void;
  setError: (message: string) => void;
}

/**
 * App startup lifecycle.
 *
 * Before the backend existed, the zustand stores read `localStorage` at module
 * import time — synchronous, instant. With an API the data arrives over the
 * network, so the app needs an explicit "still starting" phase. This store
 * provides it, and `App.tsx` renders an accessible loading state while it runs.
 *
 * In `local` mode `run()` resolves almost immediately, so this is invisible.
 */
export const useBootstrapStore = create<BootstrapState>((set) => ({
  status: 'idle',
  error: null,
  mode: 'api' as const,
  session: null,

  async run() {
    set({ status: 'loading', error: null });
    try {
      // Purge any stale client-side submission deletion tombstones from previous tests
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('dristix_deleted_submissions');
          localStorage.removeItem('dristix_admin_deleted_submissions');
        } catch {}
      }

      const source = getDataSource();

      // Give the server a moment to answer. In local mode this is instant; the
      // timeout only matters when the API is unreachable, and failing fast with
      // a readable message beats an indefinite spinner.
      const result = await Promise.race([
        source.auth.restoreSession(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);

      const user = result?.user ?? null;
      // Differentiate student session vs administrator session accurately
      if (user && (user as any).role === 'ADMIN') {
        useAuthStore.getState().setSession(null);
        useAuthStore.setState({ isAdminAuthenticated: true });
        sessionStorage.setItem('dristix_admin_auth', 'true');
        if (typeof window !== 'undefined') {
          localStorage.setItem('dristix_admin_auth', 'true');
        }
        void useAuthStore.getState().syncSubmissions();
        void useAuthStore.getState().fetchStudents();
      } else if (user) {
        useAuthStore.getState().setSession(user as any);
        useAuthStore.setState({ isAdminAuthenticated: false });
        sessionStorage.removeItem('dristix_admin_auth');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('dristix_admin_auth');
        }
        void useAuthStore.getState().syncSubmissions();
      } else {
        useAuthStore.getState().setSession(null);
        useAuthStore.setState({ isAdminAuthenticated: false });
        sessionStorage.removeItem('dristix_admin_auth');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('dristix_admin_auth');
        }
      }

      set({ status: 'ready', session: user, error: null });
    } catch (err) {
      set({
        status: 'error',
        session: null,
        error:
          err instanceof Error
            ? err.message
            : 'Could not reach the DristiX server. Check that the backend is running.',
      });
    }
  },

  setSession(user) {
    set({ session: user });
  },

  setError(message) {
    set({ status: 'error', error: message });
  },
}));
