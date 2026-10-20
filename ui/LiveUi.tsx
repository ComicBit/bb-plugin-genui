// Renders a compiled spec and re-evaluates it locally on every state change
// (no model round trip). Shared by fenced ```ui blocks and stored ::ui UIs;
// each caller supplies how Send and file links reach its thread.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useBbNavigate, type PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { collectLoads, dataKey, evaluate, initialState, type LoadedData, type Program } from "../core";
import type { Action, Diagnostic, Value } from "../core/types";
import {
  DiagnosticList,
  exampleTitle,
  GalleryFooter,
  ReplySource,
  type GalleryExample,
  type SourceFile,
  type SourceLanguage,
} from "./FrameFooter";
import { RenderNodes } from "./render";
import { useReservedHeight } from "./reservedHeight";
import { UiRuntimeContext, type UiRuntime } from "./runtime";
import { EntranceContext, newStreamCadence, trackStream, useMotionScope } from "./components/motion";

/** Blocks mounted in this page, so a remount (BB's timeline while scrolling) doesn't replay entrances. */
const MOUNTED = new Set<string>();
/** Long enough to cover the remount's first commit, short enough for the user's next action to animate. */
const REMOUNT_QUIET_MS = 300;

/** Posts `text` as the user's next message, or appends it to a draft the user is writing. */
export async function sendThroughComposer(composer: PluginComposerApi, text: string): Promise<void> {
  if (composer.isEmpty) {
    composer.insert(text);
    await composer.submit({ experimental_data: { source: "genui" } });
    return;
  }
  composer.insert(text, { at: "end", block: true });
  composer.focus();
  toast("Added to your draft");
}

/** Values the user changed earlier for this UI, from localStorage. */
function readStoredValues(storageKey: string): Record<string, Value> {
  try {
    const raw = localStorage.getItem(storageKey);
    const saved: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return {};
    // fromEntries defines own properties, so a `__proto__` state name stays data.
    return Object.fromEntries(Object.entries(saved as Record<string, Value>));
  } catch {
    return {};
  }
}

/** The message the user sent from this UI earlier, from localStorage. */
function readStoredAnswer(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function LiveUi({
  program,
  compileDiagnostics,
  source,
  stateKey,
  data,
  send,
  openFile,
  loadImage,
  readText,
  loadAudio,
  loadAsset,
  superseded = false,
  threadId,
  blockKey,
  gallery,
  streaming = false,
}: {
  program: Program;
  compileDiagnostics: readonly Diagnostic[];
  source: string;
  stateKey: string;
  /** Files the spec reads with Load and Snippet, keyed by `dataKey`. */
  data?: ReadonlyMap<string, LoadedData>;
  send(text: string): Promise<void>;
  openFile: UiRuntime["openFile"];
  loadImage: UiRuntime["loadImage"];
  readText: UiRuntime["readText"];
  loadAudio: UiRuntime["loadAudio"];
  loadAsset: UiRuntime["loadAsset"];
  /** A later user message exists in the thread (see UiRuntime.superseded). */
  superseded?: boolean;
  threadId: UiRuntime["threadId"];
  blockKey: UiRuntime["blockKey"];
  /** Set on the gallery page: which example this is (see Frame). */
  gallery?: GalleryExample;
  /** The reply is still writing this block: what mounts fades at the stream's pace (motion.ts). */
  streaming?: boolean;
}) {
  // State is the program's initial values overlaid with what the user changed.
  // Keeping the two apart lets a still-streaming program add state variables
  // without resetting the ones the user already moved.
  const initial = useMemo(() => initialState(program, data), [program, data]);
  const [changed, setChanged] = useState(() => readStoredValues(stateKey));
  const state = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(initial).map(([name, value]) => [
          name,
          Object.hasOwn(changed, name) ? changed[name] : value,
        ]),
      ),
    [initial, changed],
  );
  const restored = useRef(changed);
  useEffect(() => {
    if (changed === restored.current) return;
    try {
      localStorage.setItem(stateKey, JSON.stringify(changed));
    } catch {
      // Storage full or unavailable: the UI keeps working, it just won't persist.
    }
  }, [stateKey, changed]);

  // What the user sent from this block; choice controls collapse to it.
  const answerKey = `${stateKey}:answer`;
  const [answer, setAnswer] = useState<string | null>(() => readStoredAnswer(answerKey));

  const navigate = useBbNavigate();
  const setValue = useCallback(
    (name: string, value: Value) => {
      if (Object.hasOwn(initial, name)) setChanged((previous) => ({ ...previous, [name]: value }));
    },
    [initial],
  );

  const runAction = useCallback(
    async (action: Action) => {
      switch (action.type) {
        case "set":
          setValue(action.name, action.value);
          return;
        case "send":
          await send(action.text);
          setAnswer(action.text);
          try {
            localStorage.setItem(answerKey, action.text);
          } catch {
            // Storage unavailable: the choice collapses until the page reloads.
          }
          return;
        case "openUrl": {
          let url: URL;
          try {
            url = new URL(action.url);
          } catch {
            throw new Error(`Invalid link: ${action.url}`);
          }
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("Only http and https links can be opened");
          }
          if (!navigate.openUrl(url.href)) throw new Error(`Couldn't open ${url.href}`);
          return;
        }
        case "copy":
          await navigator.clipboard.writeText(action.text);
          toast.success("Copied");
          return;
      }
    },
    [navigate, setValue, send, answerKey],
  );

  const runtime = useMemo<UiRuntime>(
    () => ({
      setValue,
      openFile,
      loadImage,
      readText,
      loadAudio,
      loadAsset,
      answer,
      superseded,
      threadId,
      blockKey,
      async run(actions) {
        try {
          for (const action of actions) await runAction(action);
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : String(cause));
        }
      },
    }),
    [setValue, openFile, loadImage, readText, loadAudio, loadAsset, answer, superseded, threadId, blockKey, runAction],
  );

  const { roots, diagnostics } = useMemo(() => evaluate(program, state, data), [program, state, data]);
  // Memoized elements let React skip the tree when only a parent re-renders.
  const tree = useMemo(() => <RenderNodes nodes={roots} isolate />, [roots]);
  // The gallery reads files from its own folder, so they're listed under gallery/.
  const inGallery = gallery !== undefined;
  const files = useMemo(
    () =>
      collectLoads(program).map((request): SourceFile => {
        const loaded = data?.get(dataKey(request));
        return {
          path: inGallery && !request.path.startsWith("/") ? `gallery/${request.path}` : request.path,
          kind: request.raw ? "Snippet" : "Load",
          status: data !== undefined && loaded === undefined ? "reading" : loaded === undefined || loaded.ok ? "read" : { error: loaded.error },
        };
      }),
    [program, data, inGallery],
  );
  const { content, minHeight } = useReservedHeight(
    stateKey,
    files.some((file) => file.status === "reading"),
  );
  const [entrance] = useState(() => {
    const remount = MOUNTED.has(stateKey);
    MOUNTED.add(stateKey);
    return { quietUntil: remount ? performance.now() + REMOUNT_QUIET_MS : 0, stream: newStreamCadence() };
  });
  // During render, before the children that mount with this source run their entrances.
  const tracked = useRef<{ source: string; streaming: boolean } | null>(null);
  if (tracked.current?.source !== source || tracked.current.streaming !== streaming) {
    tracked.current = { source, streaming };
    trackStream(entrance.stream, streaming, performance.now());
  }

  return (
    <UiRuntimeContext value={runtime}>
      <EntranceContext value={entrance}>
        <Frame source={source} diagnostics={[...compileDiagnostics, ...diagnostics]} files={files} gallery={gallery}>
          {/* Holds the height this block last settled at while what it reads arrives (reservedHeight.ts). */}
          <div style={minHeight === undefined ? undefined : { minHeight }}>
            <div ref={content} className="flex flex-col gap-3">
              {tree}
            </div>
          </div>
        </Frame>
      </EntranceContext>
    </UiRuntimeContext>
  );
}

/**
 * Stacks the rendered content over its source chrome. In a chat reply that is
 * a Source toggle shown on hover, so replies stay quiet; with `gallery` it is
 * the gallery's footer naming the example, always shown. Both open the same
 * source panel (FrameFooter.tsx).
 */
export function Frame({
  source,
  language = "ui",
  diagnostics,
  files = [],
  gallery,
  children,
}: {
  source: string;
  language?: SourceLanguage;
  diagnostics: readonly Diagnostic[];
  /** What the spec reads with Load and Snippet. */
  files?: readonly SourceFile[];
  /** Set on the gallery page: which example this is. */
  gallery?: GalleryExample;
  children: ReactNode;
}) {
  const motion = useMotionScope();
  // data-bb-image-preview-ignore: the components size and open their own
  // images; an image-preview plugin restyling every <img> would break them.
  return gallery === undefined ? (
    <div {...motion} data-bb-image-preview-ignore="" className="group/genui not-prose my-3 flex flex-col gap-3">
      {children}
      <ReplySource source={source} language={language} files={files} diagnostics={diagnostics} />
    </div>
  ) : (
    <div
      {...motion}
      data-bb-image-preview-ignore=""
      role="group"
      aria-label={exampleTitle(gallery)}
      className="group/genui not-prose my-3 flex flex-col gap-1.5"
    >
      {children}
      <GalleryFooter example={gallery} source={source} language={language} files={files} diagnostics={diagnostics} />
    </div>
  );
}

/** Shown in place of a UI that cannot render, with the reason and its source. */
export function RenderFailure({
  source,
  diagnostics,
  gallery,
}: {
  source: string;
  diagnostics: readonly Diagnostic[];
  gallery?: GalleryExample;
}) {
  return (
    <Frame source={source} diagnostics={diagnostics} gallery={gallery}>
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs"
      >
        <p className="mb-1.5 font-medium text-destructive">This UI couldn't be rendered</p>
        <DiagnosticList diagnostics={diagnostics} />
      </div>
    </Frame>
  );
}
