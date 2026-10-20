// One fenced block in an assistant reply: ```ui renders the spec language
// through LiveUi, ```app renders a sandboxed HTML app. Both the BB fence slot
// and the DOM overlay mount this, so they behave the same.
import { memo, useCallback, useMemo, useRef } from "react";
import { useBbNavigate, useComposers, useSdk, type ExperimentalLiveFileTarget, type PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { compileStreaming } from "../core";
import { fileOpenTarget, THREAD_STORAGE_PREFIX } from "../core/file-target";
import { AppBlock } from "./AppBlock";
import { LiveUi, RenderFailure, sendThroughComposer } from "./LiveUi";
import { useAudioLoader, useImageLoader, useLoadedData, useTextLoader } from "./useLoadedData";
import { useSuperseded } from "./useSuperseded";

export type FenceLanguage = "ui" | "app";

export interface ThreadActions {
  send(threadId: string, text: string): Promise<void>;
  openFile(threadId: string, path: string, line?: number): Promise<boolean>;
}

/**
 * Send and file-open for any thread on screen. Stable across renders: the
 * composer list changes on every keystroke, so it is read through a ref.
 */
export function useThreadActions(): ThreadActions {
  const composers = useRef<readonly PluginComposerApi[]>([]);
  composers.current = useComposers();
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const send = useCallback(
    async (threadId: string, text: string) => {
      const composer = composers.current.find(
        (candidate) => candidate.scope.kind === "thread" && candidate.scope.threadId === threadId,
      );
      if (composer !== undefined) {
        await sendThroughComposer(composer, text);
        return;
      }
      await sdk.threads.send({ threadId, mode: "queue-if-active", input: [{ type: "text", text, mentions: [] }] });
    },
    [sdk],
  );
  const openFile = useCallback(
    async (threadId: string, path: string, line?: number) => {
      const location = line === undefined ? null : ({ kind: "line", line, column: null } as const);
      const open = (target: ExperimentalLiveFileTarget) => navigate.experimental_openFilePreview({ target, location });
      // An absolute path is placed by the thread's roots (core/file-target.ts),
      // the same ones data-source.ts reads Image(path) and Load(path) from; a
      // `$BB_THREAD_STORAGE/` path needs neither the thread nor its roots.
      const absolute = path.startsWith("/");
      const [thread, storage] = await Promise.all([
        path.startsWith(THREAD_STORAGE_PREFIX) ? null : sdk.threads.get({ threadId, include: "environment" }),
        absolute ? sdk.threads.storageLocation({ threadId }).catch(() => null) : null,
      ]);
      const environment = thread !== null && "environment" in thread ? (thread.environment ?? null) : null;
      const workspace = typeof environment?.path === "string" ? environment.path : null;
      const target = fileOpenTarget(path, { storage: storage?.storageRootPath ?? null, workspace });
      if (target === null) return false;
      if (target.kind === "thread-storage") return open({ kind: "thread-storage", threadId, path: target.path });
      if (target.kind === "workspace") {
        return thread?.environmentId == null ? false : open({ kind: "workspace", environmentId: thread.environmentId, path: target.path });
      }
      const hostId = typeof environment?.hostId === "string" ? environment.hostId : storage?.hostId;
      return hostId === undefined ? false : open({ kind: "host", hostId, path: target.path });
    },
    [sdk, navigate],
  );
  return useMemo(() => ({ send, openFile }), [send, openFile]);
}

export const Fence = memo(function Fence({
  language,
  code,
  complete,
  stateKey,
  threadId,
  messageId,
  actions,
}: {
  language: FenceLanguage;
  code: string;
  /** UI input stopped (closed or unclosed); apps arrive here only closed or streaming. The overlay uses text settlement. */
  complete: boolean;
  stateKey: string;
  threadId: string;
  /** The assistant message holding the block: BB's message id, which is also its timeline row id. */
  messageId: string;
  actions: ThreadActions;
}) {
  return language === "app" ? (
    <AppBlock html={code} ready={complete} />
  ) : (
    <UiFence
      code={code}
      complete={complete}
      stateKey={stateKey}
      threadId={threadId}
      messageId={messageId}
      actions={actions}
    />
  );
});

function UiFence({
  code,
  complete,
  stateKey,
  threadId,
  messageId,
  actions,
}: {
  code: string;
  complete: boolean;
  stateKey: string;
  threadId: string;
  messageId: string;
  actions: ThreadActions;
}) {
  const result = useMemo(() => compileStreaming(code), [code]);
  // While the reply streams, an unparseable prefix keeps the last good render.
  const lastGood = useRef(result.program === null ? null : result);
  if (result.program !== null) lastGood.current = result;
  const shown = lastGood.current;
  const data = useLoadedData({ threadId }, shown?.program ?? null);
  const loadImage = useImageLoader({ threadId });
  const readText = useTextLoader({ threadId });
  const loadAudio = useAudioLoader({ threadId });
  const send = useCallback((text: string) => actions.send(threadId, text), [actions, threadId]);
  const openFile = useCallback((path: string, line?: number) => actions.openFile(threadId, path, line), [actions, threadId]);
  const superseded = useSuperseded(threadId, messageId);

  if (shown?.program == null) {
    return complete ? (
      <RenderFailure source={code} diagnostics={result.diagnostics} />
    ) : (
      <div
        role="status"
        aria-label="Building UI"
        className="not-prose my-3 h-20 animate-pulse rounded-xl border border-border bg-surface-recessed"
      />
    );
  }
  return (
    <LiveUi
      program={shown.program}
      compileDiagnostics={complete && !result.complete ? result.diagnostics : shown.diagnostics}
      source={code}
      stateKey={stateKey}
      data={data}
      send={send}
      openFile={openFile}
      loadImage={loadImage}
      readText={readText}
      loadAudio={loadAudio}
      superseded={superseded}
      threadId={threadId}
      blockKey={stateKey}
      streaming={!complete}
    />
  );
}
