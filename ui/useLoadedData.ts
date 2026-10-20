// Fetches the files a spec reads with Load(path) and Snippet(path), and the
// images it shows, through the plugin backend, which confines file reads to
// the thread's workspace and thread storage (or for the gallery page to the
// plugin's gallery/ folder) and fetches https images through its
// address-checked proxy (web/lookups.ts), so every surface shows them the
// same way whatever its CSP, and the webLookups setting governs them.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { collectLoads, dataKey, type DataRequest, type LoadedData, type Program } from "../core";
import type { rpcContract } from "../server";
import type { AssetBytes, ImageUrl, TextFile } from "./runtime";

/** Where a spec's files come from: a thread's workspace and storage, or the gallery. */
export type FileScope = { readonly threadId: string } | "gallery";

type LoadedImage = { ok: true; dataUrl: string } | { ok: false; error: string; off?: boolean };

interface Loaders {
  data(path: string, raw: boolean | undefined): Promise<LoadedData>;
  image(path: string): Promise<LoadedImage>;
  audio(path: string): Promise<LoadedImage>;
  asset(path: string): Promise<LoadedImage>;
}

/** Stable per thread (or gallery), however the caller builds its scope object. */
function useLoaders(scope: FileScope): Loaders {
  const rpc = useRpc<typeof rpcContract>();
  const threadId = scope === "gallery" ? null : scope.threadId;
  return useMemo(() => {
    const file: Loaders["image"] =
      threadId === null
        ? (path) => rpc.call("gallery_image", { path })
        : (path) => rpc.call("load_image", { threadId, path });
    return {
      data:
        threadId === null
          ? (path, raw) => rpc.call("gallery_data", { path, raw })
          : (path, raw) => rpc.call("load_data", { threadId, path, raw }),
      image: (src) => (/^https:\/\//i.test(src) ? rpc.call("web_image", { url: src }) : file(src)),
      audio:
        threadId === null
          ? (path) => rpc.call("gallery_audio", { path })
          : (path) => rpc.call("load_audio", { threadId, path }),
      asset:
        threadId === null
          ? (path) => rpc.call("gallery_asset", { path })
          : (path) => rpc.call("load_asset", { threadId, path }),
    };
  }, [rpc, threadId]);
}

/**
 * Files already read in this page, by scope and request: a block BB's
 * timeline remounts as the user scrolls back renders with them at once,
 * instead of showing loading placeholders and growing under the reader. Failures are
 * not kept, so a file written later still loads; a reload reads afresh.
 */
const LOADED = new Map<string, LoadedData>();
const MAX_LOADED = 200;

function remember(key: string, loaded: LoadedData): void {
  if (!loaded.ok) return;
  LOADED.delete(key);
  LOADED.set(key, loaded);
  if (LOADED.size > MAX_LOADED) LOADED.delete(LOADED.keys().next().value!);
}

/** The spec's files keyed by `dataKey`; a request still in flight has no entry. */
export function useLoadedData(scope: FileScope, program: Program | null): ReadonlyMap<string, LoadedData> {
  const loaders = useLoaders(scope);
  const scopeKey = scope === "gallery" ? "gallery" : scope.threadId;
  // Streaming recompiles the program often; refetch only when the requests change.
  const requestsKey = useMemo(() => (program === null ? "[]" : JSON.stringify(collectLoads(program))), [program]);
  const [data, setData] = useState<ReadonlyMap<string, LoadedData>>(() => {
    const found = new Map<string, LoadedData>();
    for (const request of JSON.parse(requestsKey) as DataRequest[]) {
      const hit = LOADED.get(`${scopeKey}|${dataKey(request)}`);
      if (hit !== undefined) found.set(dataKey(request), hit);
    }
    return found;
  });

  useEffect(() => {
    const requests = JSON.parse(requestsKey) as DataRequest[];
    const missing = requests.filter((request) => !data.has(dataKey(request)));
    if (missing.length === 0) return;
    let live = true;
    for (const request of missing) {
      const key = dataKey(request);
      loaders.data(request.path, request.raw).then(
        (loaded) => {
          remember(`${scopeKey}|${key}`, loaded);
          if (live) setData((previous) => new Map(previous).set(key, loaded));
        },
        (cause: unknown) => {
          const error = cause instanceof Error ? cause.message : String(cause);
          if (live) setData((previous) => new Map(previous).set(key, { ok: false, error }));
        },
      );
    }
    return () => {
      live = false;
    };
    // `data` is read only to skip requests already loaded; re-running on each
    // arrival would refetch the requests still in flight.
  }, [loaders, requestsKey, scopeKey]);

  return data;
}

/**
 * Reads images (thread or gallery files, https URLs) as data URLs. Each src
 * is fetched once per block, so tabs and re-renders that remount an Image
 * don't refetch it; failures are not kept, so a file written later still loads.
 */
export function useImageLoader(scope: FileScope): (src: string) => Promise<ImageUrl> {
  const loaders = useLoaders(scope);
  const images = useRef(new Map<string, Promise<ImageUrl>>());
  return useCallback(
    (src: string) => {
      const cached = images.current.get(src);
      if (cached !== undefined) return cached;
      const pending = loaders.image(src).then(
        (loaded): ImageUrl => (loaded.ok ? { ok: true, url: loaded.dataUrl } : loaded),
        (cause: unknown): ImageUrl => ({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }),
      );
      images.current.set(src, pending);
      void pending.then((image) => {
        if (!image.ok) images.current.delete(src);
      });
      return pending;
    },
    [loaders],
  );
}

/**
 * Recordings already read in this page, as blob URLs (cheaper for an <audio>
 * to seek than a data URL), by scope and path, so a Transcript BB remounts
 * while the user scrolls plays at once. A few at most: they are large.
 */
const AUDIO = new Map<string, Promise<ImageUrl>>();
const MAX_AUDIO = 6;

/** Reads recordings (thread or gallery files; no web URLs) for `UiRuntime.loadAudio`. */
export function useAudioLoader(scope: FileScope): (src: string) => Promise<ImageUrl> {
  const loaders = useLoaders(scope);
  const scopeKey = scope === "gallery" ? "gallery" : scope.threadId;
  return useCallback(
    (src: string) => {
      const key = `${scopeKey}|${src}`;
      const cached = AUDIO.get(key);
      if (cached !== undefined) return cached;
      const pending = loaders.audio(src).then(
        (loaded): ImageUrl => {
          if (!loaded.ok) return loaded;
          const { bytes, type } = decodeDataUrl(loaded.dataUrl);
          return { ok: true, url: URL.createObjectURL(new Blob([bytes], { type })) };
        },
        (cause: unknown): ImageUrl => ({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }),
      );
      AUDIO.set(key, pending);
      void pending.then((audio) => {
        if (!audio.ok) AUDIO.delete(key);
      });
      if (AUDIO.size > MAX_AUDIO) {
        const [oldestKey, oldest] = AUDIO.entries().next().value!;
        AUDIO.delete(oldestKey);
        void oldest.then((audio) => audio.ok && URL.revokeObjectURL(audio.url));
      }
      return pending;
    },
    [loaders, scopeKey],
  );
}

/** data:<type>;base64,<bytes>, decoded here rather than fetched: BB's CSP may refuse data: fetches. */
function decodeDataUrl(dataUrl: string): { bytes: ArrayBuffer; type: string } {
  const comma = dataUrl.indexOf(",");
  const type = dataUrl.slice(5, dataUrl.indexOf(";"));
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { bytes: bytes.buffer, type };
}

/**
 * Scene files already read in this page (models, environments, textures),
 * by scope and path, so a Scene that drops its GPU context while scrolled
 * away rebuilds at once when it comes back. A few at most: up to 10 MB each.
 */
const ASSETS = new Map<string, Promise<AssetBytes>>();
const MAX_ASSETS = 12;

/** Reads Scene files (thread or gallery files; no web URLs) for `UiRuntime.loadAsset`. */
export function useAssetLoader(scope: FileScope): (src: string) => Promise<AssetBytes> {
  const loaders = useLoaders(scope);
  const scopeKey = scope === "gallery" ? "gallery" : scope.threadId;
  return useCallback(
    (src: string) => {
      const key = `${scopeKey}|${src}`;
      const cached = ASSETS.get(key);
      if (cached !== undefined) {
        // Most recently used last, so the oldest unused file goes first.
        ASSETS.delete(key);
        ASSETS.set(key, cached);
        return cached;
      }
      const pending = loaders.asset(src).then(
        (loaded): AssetBytes => (loaded.ok ? { ok: true, ...decodeDataUrl(loaded.dataUrl) } : loaded),
        (cause: unknown): AssetBytes => ({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }),
      );
      ASSETS.set(key, pending);
      void pending.then((asset) => {
        if (!asset.ok) ASSETS.delete(key);
      });
      if (ASSETS.size > MAX_ASSETS) ASSETS.delete(ASSETS.keys().next().value!);
      return pending;
    },
    [loaders, scopeKey],
  );
}

/**
 * Reads text files (thread or gallery) for components that show code at a
 * location they found in their data (a stack frame, a finding). Shares the
 * page's cache of raw reads with Snippet; failures are not kept.
 */
export function useTextLoader(scope: FileScope): (path: string) => Promise<TextFile> {
  const loaders = useLoaders(scope);
  const scopeKey = scope === "gallery" ? "gallery" : scope.threadId;
  return useCallback(
    async (path: string): Promise<TextFile> => {
      const key = `${scopeKey}|${dataKey({ path, raw: true })}`;
      const read = (loaded: LoadedData): TextFile =>
        !loaded.ok ? loaded : typeof loaded.value === "string" ? { ok: true, text: loaded.value } : { ok: false, error: `${path} is not a text file` };
      const cached = LOADED.get(key);
      if (cached !== undefined) return read(cached);
      try {
        const loaded = await loaders.data(path, true);
        remember(key, loaded);
        return read(loaded);
      } catch (cause) {
        return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
      }
    },
    [loaders, scopeKey],
  );
}
