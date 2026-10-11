// The `::ui{id="…"}` message directive renders UIs stored by the retired
// show_ui tool, so replies written during the pilot keep rendering. New
// replies write ```ui blocks instead (FenceOverlay).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useComposer, useRpc, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { compile } from "../core";
import type { rpcContract } from "../server";
import { LiveUi, RenderFailure, sendThroughComposer } from "./LiveUi";
import { useAudioLoader, useImageLoader, useLoadedData, useTextLoader } from "./useLoadedData";
import { useSuperseded } from "./useSuperseded";

const UI_ID = /^[a-z0-9]{10}$/;

export function UiDirective({ attributes, source, message, openWorkspaceFile }: PluginMessageDirectiveProps) {
  const id = attributes.id;
  if (id === undefined || !UI_ID.test(id)) {
    return (
      <Notice>
        Invalid UI directive: <code className="font-mono">{source}</code>
      </Notice>
    );
  }
  return (
    <StoredUi
      key={id}
      id={id}
      threadId={message.threadId}
      messageId={message.id}
      directive={source}
      openWorkspaceFile={openWorkspaceFile}
    />
  );
}

type Load =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; source: string };

function StoredUi({
  id,
  threadId,
  messageId,
  directive,
  openWorkspaceFile,
}: {
  id: string;
  threadId: string;
  /** The assistant message holding the directive. */
  messageId: string;
  directive: string;
  openWorkspaceFile: PluginMessageDirectiveProps["openWorkspaceFile"];
}) {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  useEffect(() => {
    let live = true;
    rpc.call("get_ui", { id }).then(
      ({ source }) => {
        if (live) setLoad({ status: "ready", source });
      },
      (cause: unknown) => {
        if (live) setLoad({ status: "failed", message: cause instanceof Error ? cause.message : String(cause) });
      },
    );
    return () => {
      live = false;
    };
  }, [rpc, id]);
  const source = load.status === "ready" ? load.source : "";
  const compiled = useMemo(() => compile(source), [source]);
  const send = useCallback((text: string) => sendThroughComposer(composer, text), [composer]);
  const data = useLoadedData({ threadId }, compiled.program);
  const loadImage = useImageLoader({ threadId });
  const readText = useTextLoader({ threadId });
  const loadAudio = useAudioLoader({ threadId });
  const superseded = useSuperseded(threadId, messageId);

  switch (load.status) {
    case "loading":
      return (
        <div
          role="status"
          aria-label="Loading UI"
          className="not-prose my-3 h-28 animate-pulse rounded-lg border border-border bg-surface-recessed"
        />
      );
    case "failed":
      return (
        <Notice>
          UI unavailable ({load.message}): <code className="font-mono">{directive}</code>
        </Notice>
      );
    case "ready":
      return compiled.program === null ? (
        <RenderFailure source={source} diagnostics={compiled.diagnostics} />
      ) : (
        <LiveUi
          program={compiled.program}
          compileDiagnostics={compiled.diagnostics}
          source={source}
          stateKey={`bb.genui.state:${id}`}
          data={data}
          send={send}
          openFile={openWorkspaceFile}
          loadImage={loadImage}
          readText={readText}
          loadAudio={loadAudio}
          superseded={superseded}
          threadId={threadId}
          blockKey={`bb.genui.state:${id}`}
        />
      );
  }
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="not-prose my-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}
