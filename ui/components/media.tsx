// Images. Every image, a file of the thread (workspace or
// `$BB_THREAD_STORAGE/…`) or an https URL, is read through the plugin
// backend: files confined to the thread, https images through the
// address-checked proxy that the webLookups setting switches off.
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useUiRuntime, type ImageUrl } from "../runtime";
import { optionalText, text, type Props } from "../values";
import { ErrorLine } from "./display";
import { useViewer } from "./viewer";

type Source =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "invalid"; readonly error: string };

/** What `src` names: an https URL, a thread file (no scheme), or something refused. */
export function imageSource(src: string): Source {
  if (src === "") return { kind: "invalid", error: "This image has no src" };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(src)?.[1]?.toLowerCase();
  // `C:\…` is a Windows path, not a URL scheme.
  if (scheme === undefined || /^[a-z]:[\\/]/i.test(src)) return { kind: "file", path: src };
  if (scheme !== "https") {
    return { kind: "invalid", error: `Images must be https URLs or file paths; ${scheme}: links can't be shown` };
  }
  try {
    return { kind: "url", url: new URL(src).href };
  } catch {
    return { kind: "invalid", error: `Invalid image URL: ${src}` };
  }
}

export type ImageState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly url: string }
  | { readonly status: "failed"; readonly error: string; readonly off: boolean };

/**
 * `src` (a path or an https URL) as a URL the page can show, read through
 * the runtime; null src (not known yet) stays loading. A changed src never
 * shows the previous image.
 */
export function useImageUrl(src: string | null): ImageState {
  const { loadImage } = useUiRuntime();
  const source = useMemo(() => (src === null ? null : imageSource(src.trim())), [src]);
  const target = source?.kind === "url" ? source.url : source?.kind === "file" ? source.path : null;
  const [loaded, setLoaded] = useState<{ readonly target: string; readonly image: ImageUrl } | null>(null);

  useEffect(() => {
    if (target === null || loadImage === null) return;
    let live = true;
    void loadImage(target).then((image) => {
      if (live) setLoaded({ target, image });
    });
    return () => {
      live = false;
    };
  }, [target, loadImage]);

  if (source === null) return { status: "loading" };
  if (source.kind === "invalid") return { status: "failed", error: source.error, off: false };
  if (loadImage === null) return { status: "failed", error: `Images can't be shown here: ${src}`, off: false };
  const image = loaded !== null && loaded.target === target ? loaded.image : null;
  if (image === null) return { status: "loading" };
  return image.ok ? { status: "ready", url: image.url } : { status: "failed", error: image.error, off: image.off === true };
}

/** The one quiet line web media show when the webLookups setting is off; `what` names the thing ("Map"). */
export function WebOffLine({ what }: { what: string }) {
  return (
    <p className="text-xs leading-5 text-muted-foreground">
      {what}: not shown, because web lookups are off in the Generative UI plugin settings.
    </p>
  );
}

const SURFACE = "relative flex min-w-0 justify-center overflow-hidden rounded-lg border border-border bg-surface-recessed";

/** One picture; pressing it opens it full screen, where a file can also be opened in BB. */
export function Image({ props }: { props: Props }) {
  const src = text(props.src).trim();
  const alt = optionalText(props.alt)?.trim() ?? "";
  const source = useMemo(() => imageSource(src), [src]);
  const image = useImageUrl(src);
  const [decoded, setDecoded] = useState<{ readonly url: string; readonly ok: boolean } | null>(null);
  const url = image.status === "ready" ? image.url : null;
  const { open, viewer } = useViewer(
    url === null ? [] : [{ url, alt, caption: null, path: source.kind === "file" ? source.path : undefined }],
  );

  if (image.status === "failed") {
    return image.off ? <WebOffLine what="Image" /> : <ErrorLine message={`Couldn't show ${src}: ${image.error}`} />;
  }
  const result = url !== null && decoded?.url === url ? decoded : null;
  if (result !== null && !result.ok) return <ErrorLine message={`Couldn't load the image at ${src}`} />;
  const ready = result !== null;

  return (
    <>
      <button
        type="button"
        disabled={!ready}
        aria-label={alt === "" ? "View image full size" : `${alt}. View full size`}
        onClick={(event) => open(0, event.currentTarget)}
        className={cn(SURFACE, "w-full cursor-zoom-in p-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default")}
      >
        {ready ? null : (
          <div
            role="status"
            aria-label={alt === "" ? "Loading image" : `Loading image: ${alt}`}
            className="h-48 w-full animate-pulse motion-reduce:animate-none"
          />
        )}
        {url === null ? null : (
          <img
            src={url}
            alt={alt}
            decoding="async"
            onLoad={() => setDecoded({ url, ok: true })}
            onError={() => setDecoded({ url, ok: false })}
            className={cn(
              "block h-auto max-h-96 max-w-full object-contain transition-opacity duration-200 motion-reduce:transition-none",
              ready ? "opacity-100" : "absolute inset-0 opacity-0",
            )}
          />
        )}
      </button>
      {/* Outside the button: the viewer's clicks bubble through the React tree. */}
      {viewer}
    </>
  );
}
