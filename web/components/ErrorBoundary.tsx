import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last line of defense: a rendering bug shows a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot">
        <div role="alert">
          <p>Something went wrong displaying this page.</p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
