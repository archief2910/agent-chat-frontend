"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="m-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          <h1 className="text-lg font-semibold">This view hit an error</h1>
          <p className="mt-1">Reload the page to continue. Your chats are still saved.</p>
          <button type="button" className="mt-3 underline" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
