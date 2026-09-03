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
      <div role="alert" className="m-6 max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="text-lg font-semibold text-rose-900">
          {this.props.label ?? 'This section'} didn't load
        </h2>
        <p className="mt-1 text-sm text-rose-800">
          Something went wrong while rendering. The rest of the page is still usable.
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded bg-white/70 p-2 text-xs text-rose-900">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
