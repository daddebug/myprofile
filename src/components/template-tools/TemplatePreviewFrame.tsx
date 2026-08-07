import { Component, type ReactNode } from "react";

export class TemplateRenderBoundary extends Component<
  { children: ReactNode; name: string; resetKey?: string },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(previous: Readonly<{ resetKey?: string }>) {
    if (
      this.state.error
      && previous.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: undefined });
    }
  }

  componentDidCatch(error: Error) {
    console.error(
      `[Template Preview] ${this.props.name} failed to render`,
      error,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-48 items-center justify-center px-6 py-10">
          <div className="max-w-xl border-l-2 border-peach pl-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-peach">
              Preview unavailable
            </p>
            <p className="mt-2 text-sm leading-6 text-softWhite/68">
              {this.state.error.message}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function TemplatePreviewFrame({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="min-w-0 bg-transparent">{children}</div>;
}
