import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Without this, any uncaught error during rendering (anywhere in the tree
 * below it) unmounts the entire panel, leaving nothing but a blank page -
 * with no way to recover except a manual reload. This catches that and
 * shows a real "something went wrong, try again" message with a reload
 * button instead. Mirrors the main site's ErrorBoundary
 * (src/components/ErrorBoundary.tsx).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled error caught by ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-black text-white px-6">
          <div className="max-w-sm w-full text-center">
            <h1 className="text-xl font-bold mb-3">Something went wrong.</h1>
            <p className="text-brand-muted mb-6">
              Please try reloading the page. If this keeps happening, wait a few minutes and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-lg bg-brand-yellow text-brand-black font-bold"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
