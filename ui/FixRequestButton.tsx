// The "Fix this block" button on a failed block: stages a ready repair
// request — the errors plus the source — into the thread's message draft, so
// sending asks the agent to rebuild the block. Requires the plugin runtime
// (a thread composer to write into); `ComposerGuard` hides the button where
// that is missing, such as inside tests and the gallery.
import { Component, type ReactNode } from "react";
import { useComposer } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";

/** Renders `children` until they throw, then `fallback`: a missing plugin runtime is a normal absence here, not a crash. */
export class ComposerGuard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function FixRequestButton({ request }: { request: string }) {
  const composer = useComposer();
  return (
    <button
      type="button"
      title="Stage a fix request — the errors and the source — into your message draft, and send it to have the agent repair the block"
      onClick={() => {
        composer.insert(request);
        toast("The fix request is in your message draft — review and send");
      }}
      className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 font-medium text-foreground transition-colors duration-150 hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Icon name="Wrench" aria-hidden className="size-3" />
      Fix this block
    </button>
  );
}
