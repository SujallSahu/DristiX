import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
  info: React.ErrorInfo | null;
}

/**
 * Global crash guard.
 *
 * Without this, any exception thrown while mounting or rendering unmounts the
 * entire React tree and the user is left staring at a blank white page with no
 * indication of what went wrong. This renders the failure in-place instead,
 * using the same theme tokens as the rest of the app so it stays readable in
 * every high-contrast mode.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ info });

    // Surface async failures too - these never reach getDerivedStateFromError.
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[DristiX] Unhandled render error:', error, info.componentStack);
    }
  }

  private handleReset = (): void => {
    this.setState({ error: null, info: null });
  };

  private handleHardReset = (): void => {
    try {
      window.localStorage.clear();
    } catch {
      // Storage may be unavailable (private mode); the soft reset still applies.
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error, info } = this.state;

    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="min-h-screen bg-theme-bg text-theme-text p-4 sm:p-8 font-sans"
      >
        <div className="max-w-3xl mx-auto space-y-4">
          <h1 className="text-2xl sm:text-3xl font-black text-theme-danger">
            DristiX ran into a problem
          </h1>
          <p className="text-base">
            The application stopped unexpectedly instead of rendering a blank page. The
            technical details below will help identify what went wrong.
          </p>

          <div className="border-2 border-theme-border rounded-lg overflow-hidden">
            <div className="bg-theme-surface px-4 py-2 font-bold border-b-2 border-theme-border">
              Error message
            </div>
            <pre
              tabIndex={0}
              role="region"
              aria-label="Error message details"
              className="p-4 text-sm whitespace-pre-wrap break-words bg-theme-surface-elevated overflow-x-auto focus:outline-none"
            >
              {error.message || String(error)}
            </pre>
          </div>

          {info?.componentStack ? (
            <div className="border-2 border-theme-border rounded-lg overflow-hidden">
              <div className="bg-theme-surface px-4 py-2 font-bold border-b-2 border-theme-border">
                Component stack
              </div>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Component stack trace"
                className="p-4 text-xs whitespace-pre-wrap break-words bg-theme-surface-elevated overflow-x-auto max-h-64 focus:outline-none"
              >
                {info.componentStack}
              </pre>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 font-bold rounded-lg border-2 border-theme-border bg-theme-surface text-theme-text focus:outline-none focus:ring-4 focus:ring-theme-focus-ring"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleHardReset}
              className="px-4 py-2 font-bold rounded-lg border-2 border-theme-danger bg-theme-danger text-white focus:outline-none focus:ring-4 focus:ring-theme-focus-ring"
            >
              Clear saved data and reload
            </button>
          </div>

          <p className="text-sm text-theme-text-secondary">
            &ldquo;Clear saved data and reload&rdquo; removes locally stored preferences, custom
            exams and session history from this browser, then reloads the app. Use it if the
            error persists after Try again.
          </p>
        </div>
      </div>
    );
  }
}

/**
 * Logs errors that happen outside the React render cycle (async callbacks,
 * unhandled promise rejections, Web Worker faults) so they are not lost.
 */
export function installGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    // eslint-disable-next-line no-console
    console.error('[DristiX] Uncaught error:', event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    // eslint-disable-next-line no-console
    console.error('[DristiX] Unhandled promise rejection:', event.reason);
  });
}
