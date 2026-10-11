// Photos from the web: ImageSearch (one photo found from a description) and
// Gallery (paths, https URLs and searches mixed, in a grid or a strip), with a
// shared full-screen viewer. Searches go to Wikimedia Commons through the
// backend (web/lookups.ts); every found photo is credited with its author,
// licence and Commons page, beside it and in the viewer.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { experimental_usePluginId, UrlLink } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { finiteNumber, isObject, list, optionalText, text, type Props } from "../values";
import { useImageSearch, type FoundImage } from "../webLookups";
import { ErrorLine } from "./display";
import { useImageUrl, WebOffLine } from "./media";
import { EASE_OUT_EXPO, RISE, useEntrance } from "./motion";

/** One picture the viewer can show. */
interface Viewable {
  readonly url: string;
  readonly alt: string;
  readonly caption: string | null;
  readonly credit: FoundImage | null;
}

/** Photo credit: author and licence, linked to the file's Commons page (which holds the full attribution). */
function Credit({ image, compact = false, className }: { image: FoundImage; compact?: boolean; className?: string }) {
  return (
    <p className={cn("flex min-w-0 items-baseline gap-1 text-[11px] leading-4 text-muted-foreground", className)}>
      <span className="min-w-0 truncate" title={`${image.creator} · ${image.license}`}>
        {image.creator} ·{" "}
        {image.licenseUrl === null ? (
          image.license
        ) : (
          <UrlLink href={image.licenseUrl} className="underline-offset-2 hover:text-foreground hover:underline">
            {image.license}
          </UrlLink>
        )}
      </span>
      <span aria-hidden>·</span>
      <UrlLink
        href={image.sourceUrl}
        className="shrink-0 underline-offset-2 hover:text-foreground hover:underline"
        aria-label={`Source: ${image.title} on Wikimedia Commons`}
      >
        {compact ? "Commons" : "Wikimedia Commons"}
      </UrlLink>
    </p>
  );
}

const SKELETON = "animate-pulse bg-surface-recessed motion-reduce:animate-none";
const FRAME = "relative block w-full overflow-hidden rounded-lg border border-border bg-surface-recessed";
const ZOOM_BUTTON =
  "block w-full cursor-zoom-in p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/** A picture filling its box (cropped to it), faded in once decoded. */
function Fill({ url, alt, onFailed }: { url: string; alt: string; onFailed: () => void }) {
  const [decoded, setDecoded] = useState<string | null>(null);
  const ready = decoded === url;
  return (
    <>
      {ready ? null : <span aria-hidden className={cn("absolute inset-0", SKELETON)} />}
      <img
        src={url}
        alt={alt}
        decoding="async"
        draggable={false}
        onLoad={() => setDecoded(url)}
        onError={onFailed}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-300 motion-reduce:transition-none",
          ready ? "opacity-100" : "opacity-0",
        )}
      />
    </>
  );
}

/** Box shape and width per aspect: portrait and square photos stay narrower than the column. */
const ASPECTS = {
  wide: { box: "aspect-[16/9]", width: "w-full" },
  square: { box: "aspect-square", width: "w-full max-w-sm" },
  tall: { box: "aspect-[3/4]", width: "w-full max-w-xs" },
} as const;

export function ImageSearch({ props }: { props: Props }) {
  const query = text(props.query).trim();
  const alt = optionalText(props.alt)?.trim() || query;
  const aspect = ASPECTS[props.aspect === "square" || props.aspect === "tall" ? props.aspect : "wide"];
  const found = useImageSearch(query);
  const image = useImageUrl(found?.ok ? found.image.url : null);
  const [broken, setBroken] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  if (query === "") return <ErrorLine message="ImageSearch needs a description to search for" />;
  if (found !== null && !found.ok) {
    if (found.off) return <WebOffLine what={`Photo of “${query}”`} />;
    return <p className="text-xs leading-5 text-muted-foreground">No photo found for “{query}”.</p>;
  }
  if (image.status === "failed") {
    return image.off ? <WebOffLine what={`Photo of “${query}”`} /> : <ErrorLine message={`Couldn't show the photo of “${query}”: ${image.error}`} />;
  }
  const url = image.status === "ready" ? image.url : null;
  if (url !== null && broken === url) return <ErrorLine message={`Couldn't load the photo of “${query}”`} />;
  const credit = found?.ok ? found.image : null;

  return (
    // data-bb-image-preview-ignore: these pictures have their own viewer; image-preview plugins must leave them alone.
    <figure data-bb-image-preview-ignore="" className={cn("m-0 flex min-w-0 flex-col gap-1.5", aspect.width)}>
      <div className={cn(FRAME, aspect.box)}>
        {url === null || credit === null ? (
          <span role="status" aria-label={`Finding a photo of ${query}`} className={cn("absolute inset-0", SKELETON)} />
        ) : (
          <button
            ref={opener}
            type="button"
            aria-label={`${alt}. View full size`}
            onClick={() => setViewing(true)}
            className={cn(ZOOM_BUTTON, "absolute inset-0")}
          >
            <Fill url={url} alt={alt} onFailed={() => setBroken(url)} />
          </button>
        )}
      </div>
      {credit === null ? (
        <span aria-hidden className={cn("h-4 w-2/3 rounded", SKELETON)} />
      ) : (
        <figcaption>
          <Credit image={credit} />
        </figcaption>
      )}
      {viewing && url !== null ? (
        <Viewer
          items={[{ url, alt, caption: null, credit }]}
          index={0}
          onIndex={() => {}}
          onClose={() => {
            setViewing(false);
            opener.current?.focus();
          }}
        />
      ) : null}
    </figure>
  );
}

/** One Gallery entry, as written. */
interface Entry {
  readonly src: string | null;
  readonly query: string | null;
  readonly caption: string | null;
  readonly alt: string;
}

/** A path or https URL, or `{src|query, caption?, alt?}`; null when the item names no picture. */
function entry(item: unknown): Entry | null {
  if (typeof item === "string") return item.trim() === "" ? null : { src: item.trim(), query: null, caption: null, alt: "" };
  if (!isObject(item)) return null;
  const src = optionalText(item.src)?.trim() || null;
  const query = optionalText(item.query)?.trim() || null;
  if (src === null && query === null) return null;
  const caption = optionalText(item.caption)?.trim() || null;
  return { src, query: src === null ? query : null, caption, alt: optionalText(item.alt)?.trim() || caption || query || "" };
}

/** Above this many pictures (without `columns`) the gallery is one scrolling strip, not a tall grid. */
const STRIP_AFTER = 9;
const GRID_GAP = "0.5rem";

type TileState = { readonly status: "ready"; readonly view: Viewable } | { readonly status: "pending" } | { readonly status: "off" };

function Tile({
  entry: { src, query, caption, alt },
  onState,
  onOpen,
}: {
  entry: Entry;
  onState: (state: TileState) => void;
  onOpen: (opener: HTMLButtonElement) => void;
}) {
  const rise = useEntrance<HTMLElement>(RISE);
  const found = useImageSearch(query ?? "");
  const credit = found?.ok ? found.image : null;
  const image = useImageUrl(src ?? credit?.url ?? null);
  const [broken, setBroken] = useState<string | null>(null);
  const url = image.status === "ready" && broken !== image.url ? image.url : null;
  const off = (found !== null && !found.ok && found.off === true) || (image.status === "failed" && image.off);
  const failure =
    found !== null && !found.ok && !off
      ? `No photo found for “${query}”`
      : image.status === "failed" && !off
        ? image.error
        : image.status === "ready" && broken === image.url
          ? "Couldn't load this picture"
          : null;

  useEffect(() => {
    onState(url !== null ? { status: "ready", view: { url, alt, caption, credit } } : off ? { status: "off" } : { status: "pending" });
  }, [url, alt, caption, credit, off, onState]);

  const label = caption ?? alt;
  return (
    <figure ref={rise} className="m-0 flex min-w-0 flex-col gap-1.5">
      <div className={cn(FRAME, "aspect-[4/3]")}>
        {url !== null ? (
          <button
            type="button"
            aria-label={label === "" ? "View full size" : `${label}. View full size`}
            onClick={(event) => onOpen(event.currentTarget)}
            className={cn(ZOOM_BUTTON, "absolute inset-0")}
          >
            <Fill url={url} alt={alt} onFailed={() => setBroken(url)} />
          </button>
        ) : off || failure !== null ? (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] leading-4 text-muted-foreground">
            {off ? "Web lookups are off" : failure}
          </span>
        ) : (
          <span role="status" aria-label={label === "" ? "Loading picture" : `Loading ${label}`} className={cn("absolute inset-0", SKELETON)} />
        )}
      </div>
      {caption === null && credit === null ? null : (
        <figcaption className="flex min-w-0 flex-col gap-0.5">
          {caption === null ? null : <span className="line-clamp-2 text-xs leading-4 text-foreground">{caption}</span>}
          {credit === null ? null : <Credit image={credit} compact />}
        </figcaption>
      )}
    </figure>
  );
}

export function Gallery({ props }: { props: Props }) {
  const items = list(props.images);
  const entries = items.map(entry);
  const requested = finiteNumber(props.columns);
  const columns = requested === null ? null : Math.min(6, Math.max(1, Math.round(requested)));
  const shown = entries.flatMap((item, index) => (item === null ? [] : [{ item, index }]));
  const strip = columns === null && shown.length > STRIP_AFTER;
  const [states, setStates] = useState<ReadonlyMap<number, TileState>>(() => new Map());
  const [viewing, setViewing] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const reporters = useRef(new Map<number, (state: TileState) => void>());

  /** A stable state callback per tile, so tiles don't re-report on every render. */
  const reporter = useCallback((index: number) => {
    let report = reporters.current.get(index);
    if (report === undefined) {
      report = (state: TileState) =>
        setStates((previous) => {
          const before = previous.get(index);
          if (before?.status === state.status && (state.status !== "ready" || (before.status === "ready" && before.view.url === state.view.url && before.view.credit === state.view.credit))) {
            return previous;
          }
          return new Map(previous).set(index, state);
        });
      reporters.current.set(index, report);
    }
    return report;
  }, []);

  if (items.length === 0) return <ErrorLine message="Gallery needs images: paths, https URLs or {query} searches" />;
  // While streaming, the last item may not have its src or query yet.
  const unusable = entries.findIndex((item, index) => item === null && index < entries.length - 1);
  const views = shown.flatMap(({ index }) => {
    const state = states.get(index);
    return state?.status === "ready" ? [{ index, view: state.view }] : [];
  });
  const allOff = shown.length > 0 && shown.every(({ index }) => states.get(index)?.status === "off");
  const count = shown.length;
  const auto = count === 1 ? 1 : count === 2 || count === 4 ? 2 : 3;
  const template = `repeat(auto-fill,minmax(max(min(8rem,100%),calc((100% - ${(columns ?? auto) - 1} * ${GRID_GAP}) / ${columns ?? auto})),1fr))`;
  const at = viewing === null ? -1 : views.findIndex((view) => view.index === viewing);

  return (
    <div data-bb-image-preview-ignore="" className="@container flex min-w-0 flex-col gap-2">
      {unusable === -1 ? null : <ErrorLine message={`Gallery item ${unusable + 1} needs a src (path or https URL) or a query`} />}
      <div
        role="list"
        aria-label="Gallery"
        className={
          strip
            ? "flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto pb-1.5 [scrollbar-width:thin]"
            : "grid min-w-0 gap-2"
        }
        style={strip ? undefined : { gridTemplateColumns: template }}
      >
        {shown.map(({ item, index }) => (
          <div role="listitem" key={index} className={strip ? "w-44 shrink-0 snap-start @md:w-52" : "min-w-0"}>
            <Tile
              entry={item}
              onState={reporter(index)}
              onOpen={(button) => {
                opener.current = button;
                setViewing(index);
              }}
            />
          </div>
        ))}
      </div>
      {allOff ? <WebOffLine what="Gallery pictures" /> : null}
      {at === -1 ? null : (
        <Viewer
          items={views.map(({ view }) => view)}
          index={at}
          onIndex={(next) => setViewing(views[next].index)}
          onClose={() => {
            setViewing(null);
            opener.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** Horizontal travel that turns a drag into the next or previous picture. */
const SWIPE_PX = 48;

/**
 * Full-screen viewer: the picture whole, its caption and credit, previous and
 * next by buttons, arrow keys or a swipe, closed by Escape, the close button,
 * a tap outside the picture or a swipe down. Portaled to the body with the
 * plugin's scope attributes so its styles still apply.
 */
function Viewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: readonly Viewable[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const pluginId = experimental_usePluginId();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const item = items[Math.min(index, items.length - 1)];
  const many = items.length > 1;
  const step = useCallback((by: number) => onIndex((index + by + items.length) % items.length), [index, items.length, onIndex]);

  useLayoutEffect(() => {
    close.current?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) dialog.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE_OUT_EXPO });
    return () => {
      root.style.overflow = overflow;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (many && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Tab") {
      // Keep focus inside the dialog.
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? [])];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (start === null || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (many && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    else if (dy > SWIPE_PX * 2 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
  };

  const navButton =
    "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

  return createPortal(
    <div data-bb-plugin={pluginId} data-bb-plugin-root="" data-bb-portaled-overlay="" data-bb-image-preview-ignore="">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={item.caption ?? (item.alt || "Picture")}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipe.current = null;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        className="fixed inset-0 z-[2147483000] flex touch-none select-none flex-col text-white backdrop-blur-md"
        style={{ background: "rgb(0 0 0 / 0.94)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className="text-xs tabular-nums text-white/70">{many ? `${index + 1} / ${items.length}` : ""}</span>
          <button ref={close} type="button" aria-label="Close" onClick={onClose} className={navButton}>
            <Icon name="X" className="size-5" />
          </button>
        </div>
        <div
          className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 py-3"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          {many ? (
            <button type="button" aria-label="Previous picture" onClick={() => step(-1)} className={cn(navButton, "max-sm:hidden")}>
              <Icon name="ChevronLeft" className="size-5" />
            </button>
          ) : null}
          <img
            key={item.url}
            src={item.url}
            alt={item.alt}
            draggable={false}
            className="block max-h-full min-w-0 max-w-full rounded-md object-contain"
          />
          {many ? (
            <button type="button" aria-label="Next picture" onClick={() => step(1)} className={cn(navButton, "max-sm:hidden")}>
              <Icon name="ChevronRight" className="size-5" />
            </button>
          ) : null}
        </div>
        {item.caption === null && item.credit === null ? null : (
          <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-col gap-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
            {item.caption === null ? null : <p className="text-sm leading-5 text-white/90">{item.caption}</p>}
            {item.credit === null ? null : (
              <Credit image={item.credit} className="justify-center text-white/60 [&_a:hover]:text-white" />
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
