import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  // TEMPORARY DIAGNOSTIC (see below) - not used for anything but display.
  error: Error | null;
  componentStack: string | null;
}

/**
 * Without this, any uncaught error during rendering (anywhere in the tree
 * below it) unmounts the entire page, leaving nothing but the plain dark
 * background color - which looks exactly like a blank/black screen with
 * no way to recover except waiting. This catches that and shows a real
 * "something went wrong, try again" message with a reload button instead.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('Unhandled error caught by ErrorBoundary:', error);
    this.setState({ componentStack: errorInfo.componentStack ?? null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#1a1d1e] text-white px-6 py-10">
          <div className="max-w-sm w-full text-center">
            <h1 className="text-xl font-bold mb-3">Something went wrong.</h1>
            <p className="text-brand-muted mb-6">
              Please try reloading the page. If this keeps happening, wait a few minutes and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-sm bg-brand-yellow text-[#1a1d1e] font-bold"
            >
              Reload
            </button>

            {/* TEMPORARY DIAGNOSTIC - remove once the mobile PDF-viewer crash
                is root-caused. Shows the real error text directly on screen
                so it can be read/screenshotted on a device with no dev tools
                (no Mac/Web Inspector needed) instead of only going to the
                console, which isn't reachable at all on iOS without one. */}
            {this.state.error && (
              <pre className="mt-6 max-h-64 overflow-auto text-left text-[10px] leading-snug text-red-300 bg-black/40 rounded-sm p-3 whitespace-pre-wrap break-words">
                {this.state.error.name}: {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
                {this.state.componentStack ? `\n---component stack---${this.state.componentStack}` : ''}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
