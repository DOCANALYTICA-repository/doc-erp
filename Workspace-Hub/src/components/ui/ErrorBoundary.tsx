import React from 'react';

/**
 * There were zero error boundaries in this application.
 *
 * That is why a single render-time throw — say `courses.map` on a `{}` that a
 * failed fetch returned — produced a completely blank page rather than a
 * broken section. Mounted at the root and around the authenticated <Outlet/>,
 * so a module crash costs that module and not the whole shell.
 */
interface Props {
  children: React.ReactNode;
  /** Shown instead of the default panel. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** What blew up, for the message. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div role="alert" className="m-6 max-w-xl rounded-lg border border-error/25 bg-error-muted p-6">
        <h2 className="text-lg font-semibold text-error">
          {this.props.label ?? 'This section'} didn't load
        </h2>
        <p className="mt-1 text-sm text-error">
          Something went wrong while rendering. The rest of the page is still usable.
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded bg-card/70 p-2 text-xs text-error">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 rounded-lg bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90"
        >
          Try again
        </button>
      </div>
    );
  }
}
