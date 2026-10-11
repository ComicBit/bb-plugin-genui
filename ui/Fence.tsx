// One fenced block in an assistant reply: ```ui renders the spec language
// through LiveUi, ```app renders a sandboxed HTML app. Both the BB fence slot
// and the DOM overlay mount this, so they behave the same.
import { memo, useCallback, useMemo, useRef } from "react";
import { useBbNavigate, useComposers, useSdk, type PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { compileStreaming } from "../core";
import { AppBlock } from "./AppBlock";
import { LiveUi, RenderFailure, sendThroughComposer } from "./LiveUi";
import { useAudioLoader, useImageLoader, useLoadedData, useTextLoader } from "./useLoadedData";
import { useSuperseded } from "./useSuperseded";

export type FenceLanguage = "ui" | "app";

const THREAD_STORAGE_PREFIX = "$BB_THREAD_STORAGE/";

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
      // `$BB_THREAD_STORAGE/…` paths name the thread's storage, not its workspace.
      if (path.startsWith(THREAD_STORAGE_PREFIX)) {
        return navigate.experimental_openFilePreview({
          target: { kind: "thread-storage", threadId, path: path.slice(THREAD_STORAGE_PREFIX.length) },
          location,
        });
      }
      const thread = await sdk.threads.get({ threadId });
      return thread.environmentId === null
        ? false
        : navigate.experimental_openFilePreview({
            target: { kind: "workspace", environmentId: thread.environmentId, path },
            location,
          });
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
  /** The closing fence arrived (or, without the BB slot, the text stopped changing). */
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
    />
  );
}
