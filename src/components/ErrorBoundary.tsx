import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { errorMessage, logError } from '../lib/errors.ts';

interface BoundaryProps {
  route: string;
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
}

// StrictMode can report the same development error twice; log each error once.
const loggedErrors = new WeakSet<object>();

class PageErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error : new Error(errorMessage(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const key = typeof error === 'object' && error !== null ? error : null;
    if (key && loggedErrors.has(key)) return;
    if (key) loggedErrors.add(key);
    logError('render error', error, {
      route: this.props.route,
      componentStack: info.componentStack ?? '',
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" role="alert">
        <h1 className="page-title">This screen hit an error</h1>
        <p>
          The page failed to render, but the rest of the app still works — use the navigation to
          continue.
        </p>
        <p className="muted">
          Route {this.props.route}: {this.state.error.message}
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <Link className="btn" to="/" onClick={() => this.setState({ error: null })}>
            Back to scores
          </Link>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Route-level safety net: a render failure replaces the page body only, so the
 * top bar and bottom navigation stay usable. A navigation remounts the boundary.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const route = location.pathname + location.search + location.hash;
  return (
    <PageErrorBoundary key={route} route={route}>
      {children}
    </PageErrorBoundary>
  );
}
