import { Component, ErrorInfo, ReactNode } from "react";
import i18n from "@i18n/config";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary capturó un error:", error, info);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-dvh bg-bg-base flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 text-signal-danger mb-4">
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-subheading font-medium text-text-base mb-2">
          {i18n.t("errorBoundary.title")}
        </h1>
        <p className="text-text-muted max-w-md mb-6">
          {i18n.t("errorBoundary.description")}
        </p>
        <button
          onClick={this.handleReload}
          className="px-6 py-2 bg-primary-500 text-white rounded-button hover:bg-primary-600 transition-colors cursor-pointer"
        >
          {i18n.t("errorBoundary.reload")}
        </button>
      </div>
    );
  }
}
