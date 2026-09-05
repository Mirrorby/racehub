import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Ловит непойманные ошибки рендера где угодно в дереве. Без этого любой
 * баг в конкретной странице роняет всё Mini App в белый экран внутри
 * Telegram WebView, откуда пользователь не может даже прочитать текст
 * ошибки в консоли.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rh-app-shell">
          <div className="rh-content">
            <ErrorState message="Something went wrong. Please try again." onRetry={this.reset} />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
