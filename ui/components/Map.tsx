// Map: numbered places on OpenStreetMap tiles beside a list of them with
// their notes (below the map on a phone). Pins and list rows highlight each
// other; the map fits every place, pans and zooms by drag, pinch, ctrl/⌘ +
// wheel, double click, buttons and keys, and can join the places in order
// with a route line. No map library: the projection and tiling are
// mapMath.ts, tiles and place names come through the backend (web/lookups.ts).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { UrlLink, useRpc } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../server";
import { ACCENT, finiteNumber, isObject, list, optionalText, type Props } from "../values";
import { useDarkTheme } from "../theme";
import { cachedTile, geocode, loadTile, type PlaceResult } from "../webLookups";
import { ErrorLine } from "./display";
import { WebOffLine } from "./media";
import {
  clampView,
  fitView,
  MAX_ZOOM,
  pan,
  project,
  tileZoom,
  toScreen,
  visibleTiles,
  zoomAround,
  type Point,
  type Size,
  type View,
} from "./mapMath";
import { reducedMotion, RISE, useEntrance } from "./motion";
import { NO_BB_SWIPE } from "./viewer";

interface Place {
  readonly name: string;
  readonly note: string | null;
  /** Coordinates given in the spec; null when the name has to be looked up. */
  readonly given: { readonly lat: number; readonly lng: number } | null;
}

/** A place as written: `{name, lat?, lng?, note?}` or a bare name; null when it has no name. */
function readPlace(item: unknown): Place | null {
  const fields: Readonly<Record<string, unknown>> = isObject(item) ? item : { name: item };
  const name = optionalText(fields.name)?.trim() ?? "";
  if (name === "") return null;
  const lat = finiteNumber(fields.lat);
  const lng = finiteNumber(fields.lng);
  const valid = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return { name, note: optionalText(fields.note)?.trim() || null, given: valid ? { lat, lng } : null };
}

/** How long the last place must stay unchanged before its name is looked up (it may still be streaming its lat/lng). */
const SETTLE_MS = 700;
const PADDING = 44;
const SINGLE_PLACE_ZOOM = 14;
const FIT_MAX_ZOOM = 15;
/** Movement before a press becomes a drag (so a tap on a pin stays a click). */
const DRAG_PX = 4;

function lookupKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Looks up the places that have no coordinates, one at a time in order, each
 * nudged toward the places already known (the backend keeps to Photon's
 * one-request-a-second). Results by lowercased name.
 */
function useLookups(places: readonly (Place | null)[]): ReadonlyMap<string, PlaceResult> {
  const rpc = useRpc<typeof rpcContract>();
  const [found, setFound] = useState<ReadonlyMap<string, PlaceResult>>(() => new Map());
  const busy = useRef(false);
  const signature = JSON.stringify(places);
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(signature), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [signature]);

  useEffect(() => {
    if (busy.current) return;
    const pending = places.findIndex(
      (place, index) =>
        place !== null &&
        place.given === null &&
        !found.has(lookupKey(place.name)) &&
        (index < places.length - 1 || settled === signature),
    );
    const place = pending === -1 ? null : places[pending];
    if (place === null) return;
    const known = places.flatMap((other) => {
      if (other === null) return [];
      if (other.given !== null) return [other.given];
      const result = found.get(lookupKey(other.name));
      return result?.ok ? [{ lat: result.lat, lng: result.lng }] : [];
    });
    const near =
      known.length === 0
        ? null
        : {
            lat: known.reduce((sum, at) => sum + at.lat, 0) / known.length,
            lng: known.reduce((sum, at) => sum + at.lng, 0) / known.length,
          };
    busy.current = true;
    void geocode(rpc, place.name, near).then((result) => {
      busy.current = false;
      setFound((previous) => new Map(previous).set(lookupKey(place.name), result));
    });
  }, [rpc, places, found, settled, signature]);

  return found;
}

/** One map tile: fetched when drawn, faded in once decoded. */
function MapTile({ z, x, y, left, top, size, onOff }: { z: number; x: number; y: number; left: number; top: number; size: number; onOff: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const key = `${z}/${x}/${y}`;
  const [url, setUrl] = useState<{ readonly key: string; readonly url: string } | null>(() => {
    const cached = cachedTile(z, x, y);
    return cached === null ? null : { key, url: cached };
  });
  const [shown, setShown] = useState(url !== null);
  useEffect(() => {
    if (url?.key === key) return;
    let live = true;
    void loadTile(rpc, z, x, y).then((result) => {
      if (!live) return;
      if (result.ok) setUrl({ key, url: result.dataUrl });
      else if (result.off === true) onOff();
    });
    return () => {
      live = false;
    };
  }, [rpc, z, x, y, key, url, onOff]);
  if (url?.key !== key) return null;
  return (
    <img
      src={url.url}
      alt=""
      draggable={false}
      onLoad={() => setShown(true)}
      className={cn("absolute max-w-none select-none transition-opacity duration-200 motion-reduce:transition-none", shown ? "opacity-100" : "opacity-0")}
      // Half a pixel of overlap hides seams between fractional-zoom tiles.
      style={{ left: Math.floor(left), top: Math.floor(top), width: Math.ceil(size) + 1, height: Math.ceil(size) + 1 }}
    />
  );
}

/** Tiles of an earlier level the page already holds, drawn under the current level while it loads. */
function Backdrop({ view, size, z }: { view: View; size: Size; z: number }) {
  const tiles = visibleTiles(view, size, z);
  if (tiles.length > 48) return null;
  return tiles.map((tile) => {
    const url = cachedTile(tile.z, tile.x, tile.y);
    return url === null ? null : (
      <img
        key={tile.key}
        src={url}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ left: Math.floor(tile.left), top: Math.floor(tile.top), width: Math.ceil(tile.size) + 1, height: Math.ceil(tile.size) + 1 }}
      />
    );
  });
}

const MARKER = "flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums text-white";
const CONTROL =
  "flex size-8 cursor-pointer items-center justify-center bg-background text-foreground transition-colors hover:bg-surface-recessed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

type Gesture =
  | { readonly kind: "press"; readonly id: number; readonly x: number; readonly y: number; readonly view: View }
  | { readonly kind: "drag"; readonly id: number; readonly x: number; readonly y: number; readonly view: View }
  | { readonly kind: "pinch"; readonly distance: number; readonly mid: { left: number; top: number }; readonly view: View };

export function MapView({ props }: { props: Props }) {
  const items = list(props.places);
  const places = useMemo(() => items.map(readPlace), [items]);
  const route = props.route === true;
  const lookups = useLookups(places);
  const dark = useDarkTheme();
  const rise = useEntrance<HTMLDivElement>(RISE);

  const viewport = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [tilesOff, setTilesOff] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  /** The level whose tiles finished loading last: drawn as a backdrop while another loads. */
  const [backdropZ, setBackdropZ] = useState<number | null>(null);
  const moved = useRef(false);
  const animation = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const located = places.map((place) => {
    if (place === null) return null;
    if (place.given !== null) return place.given;
    const result = lookups.get(lookupKey(place.name));
    return result?.ok ? { lat: result.lat, lng: result.lng } : null;
  });
  const points: (Point | null)[] = located.map((at) => (at === null ? null : project(at.lat, at.lng)));
  // Points are rebuilt every render; the key changes only when a place moves or arrives.
  const pointsKey = JSON.stringify(points);
  const latestPoints = useRef(points);
  latestPoints.current = points;
  const lookupsOff = [...lookups.values()].some((result) => !result.ok && result.off === true);
  const off = tilesOff || lookupsOff;

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) =>
        previous !== null && previous.width === rect.width && previous.height === rect.height ? previous : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [off]);

  const fit = useCallback(
    (at: Size): View => {
      const shown = latestPoints.current.filter((point) => point !== null);
      return fitView(shown, at, PADDING, shown.length === 1 ? SINGLE_PLACE_ZOOM : FIT_MAX_ZOOM);
    },
    // Refit when the places change; they are read through the ref.
    [pointsKey],
  );

  // Until the user moves the map, it keeps fitting the places as they arrive.
  useEffect(() => {
    if (size === null || moved.current) return;
    setView(fit(size));
  }, [size, fit]);

  const stopAnimation = () => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  };

  /** Glides to `target` (jumps under reduced motion). */
  const animateTo = useCallback(
    (target: View) => {
      stopAnimation();
      if (view === null || reducedMotion()) {
        setView(target);
        return;
      }
      const from = view;
      // Travel across the antimeridian the short way.
      const dx = target.x - from.x - Math.round(target.x - from.x);
      const started = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - started) / 320);
        const ease = 1 - (1 - t) ** 3;
        setView({ x: from.x + dx * ease, y: from.y + (target.y - from.y) * ease, zoom: from.zoom + (target.zoom - from.zoom) * ease });
        animation.current = t < 1 ? requestAnimationFrame(frame) : null;
      };
      animation.current = requestAnimationFrame(frame);
    },
    [view],
  );

  useEffect(() => stopAnimation, []);

  // ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl + wheel) zooms; a plain wheel scrolls the page.
  useEffect(() => {
    const element = viewport.current;
    if (element === null || size === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      stopAnimation();
      moved.current = true;
      const rect = element.getBoundingClientRect();
      const anchor = { left: event.clientX - rect.left, top: event.clientY - rect.top };
      setView((current) => (current === null ? current : zoomAround(current, current.zoom - event.deltaY * 0.01, anchor, size)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [size]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = viewport.current?.getBoundingClientRect();
    return { left: event.clientX - (rect?.left ?? 0), top: event.clientY - (rect?.top ?? 0) };
  };

  const startPinch = (current: View) => {
    const [a, b] = [...pointers.current.values()];
    const rect = viewport.current?.getBoundingClientRect();
    gesture.current = {
      kind: "pinch",
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { left: (a.x + b.x) / 2 - (rect?.left ?? 0), top: (a.y + b.y) / 2 - (rect?.top ?? 0) },
      view: current,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (view === null || (event.pointerType === "mouse" && event.button !== 0)) return;
    stopAnimation();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      event.currentTarget.setPointerCapture(event.pointerId);
      for (const id of pointers.current.keys()) if (!event.currentTarget.hasPointerCapture(id)) event.currentTarget.setPointerCapture(id);
      startPinch(view);
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: "press", id: event.pointerId, x: event.clientX, y: event.clientY, view };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || size === null) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = gesture.current;
    if (current === null) return;
    if (current.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const rect = viewport.current?.getBoundingClientRect();
      const mid = { left: (a.x + b.x) / 2 - (rect?.left ?? 0), top: (a.y + b.y) / 2 - (rect?.top ?? 0) };
      const zoomed = zoomAround(current.view, current.view.zoom + Math.log2(distance / current.distance), current.mid, size);
      setView(pan(zoomed, mid.left - current.mid.left, mid.top - current.mid.top, size));
      moved.current = true;
      return;
    }
    if (current.kind === "pinch" || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.kind === "press") {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { ...current, kind: "drag" };
    }
    moved.current = true;
    setView(pan(current.view, dx, dy, size));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 1 && view !== null) {
      // One finger lifted from a pinch: carry on as a drag from here.
      const [[id, at]] = [...pointers.current.entries()];
      gesture.current = { kind: "drag", id, x: at.x, y: at.y, view };
    } else if (pointers.current.size === 0) {
      gesture.current = null;
    }
  };

  const zoomBy = (by: number) => {
    if (view === null || size === null) return;
    moved.current = true;
    animateTo(zoomAround(view, Math.round(view.zoom) + by, { left: size.width / 2, top: size.height / 2 }, size));
  };

  const showAll = () => {
    if (size === null) return;
    moved.current = false;
    animateTo(fit(size));
  };

  const focusPlace = (index: number) => {
    const point = points[index];
    setSelected(index);
    if (point === null || size === null || view === null) return;
    moved.current = true;
    animateTo(clampView({ x: point.x, y: point.y, zoom: Math.max(view.zoom, 12) }, size));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (view === null || size === null || event.target !== event.currentTarget) return;
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      moved.current = true;
      animateTo(pan(view, moves[event.key][0], moves[event.key][1], size));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(-1);
    } else if (event.key === "0") {
      event.preventDefault();
      showAll();
    }
  };

  const z = view === null ? null : tileZoom(view);
  const tiles = view === null || size === null ? [] : visibleTiles(view, size);
  // Remember the level once its tiles are all on the page, for the next zoom's backdrop.
  useEffect(() => {
    if (z === null || tiles.length === 0) return;
    if (tiles.every((tile) => cachedTile(tile.z, tile.x, tile.y) !== null)) setBackdropZ(z);
  });
  const onTilesOff = useCallback(() => setTilesOff(true), []);

  if (items.length === 0) return <ErrorLine message="Map needs places: {name, lat?, lng?, note?}" />;
  const unnamed = places.findIndex((place, index) => place === null && index < places.length - 1);
  const active = hovered ?? selected;
  const count = places.filter((place) => place !== null).length;
  const numbers = places.map((_, index) => places.slice(0, index + 1).filter((place) => place !== null).length);
  const screen = view === null || size === null ? [] : points.map((point) => (point === null ? null : toScreen(point, view, size)));
  const routeLine = route
    ? screen
        .filter((at) => at !== null)
        .map((at) => `${at.left.toFixed(1)},${at.top.toFixed(1)}`)
        .join(" ")
    : "";
  const tileFilter = dark ? "invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.6)" : undefined;

  return (
    // Tiles are not pictures to preview: keep image-preview plugins off them.
    <div ref={rise} data-bb-image-preview-ignore="" className="@container min-w-0">
      {unnamed === -1 ? null : <ErrorLine message={`Map place ${unnamed + 1} needs a name`} />}
      <div className={cn("flex min-w-0 flex-col gap-3", !off && "@xl:flex-row @xl:items-start")}>
        {off ? (
          <div className="@xl:flex-1">
            <WebOffLine what="Map" />
          </div>
        ) : (
          <div
            ref={viewport}
            role="region"
            aria-roledescription="map"
            aria-label={`Map of ${count} ${count === 1 ? "place" : "places"}. Arrow keys pan, plus and minus zoom, 0 shows every place.`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            {...NO_BB_SWIPE}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={(event) => {
              if (view === null || size === null || event.target !== event.currentTarget) return;
              moved.current = true;
              animateTo(zoomAround(view, Math.round(view.zoom) + 1, local(event), size));
            }}
            className="relative h-64 min-w-0 cursor-grab touch-none select-none overflow-hidden rounded-lg border border-border bg-surface-recessed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing @md:h-80 @xl:h-[22rem] @xl:flex-1"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ filter: tileFilter }}>
              {view !== null && size !== null && backdropZ !== null && backdropZ !== z && Math.abs(backdropZ - (z ?? 0)) <= 2 ? (
                <Backdrop view={view} size={size} z={backdropZ} />
              ) : null}
              {tiles.map((tile) => (
                <MapTile key={tile.key} z={tile.z} x={tile.x} y={tile.y} left={tile.left} top={tile.top} size={tile.size} onOff={onTilesOff} />
              ))}
            </div>
            {routeLine === "" ? null : (
              <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
                <polyline points={routeLine} fill="none" stroke="var(--background)" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
                <polyline points={routeLine} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )}
            {screen.map((at, index) => {
              const place = places[index];
              if (at === null || place === null || size === null) return null;
              if (at.left < -20 || at.top < -20 || at.left > size.width + 20 || at.top > size.height + 20) return null;
              const on = active === index;
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={`${numbers[index]}. ${place.name}`}
                  aria-pressed={selected === index}
                  onClick={() => {
                    setSelected(index);
                    listRef.current?.querySelector(`[data-place="${index}"]`)?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
                  }}
                  onPointerEnter={() => setHovered(index)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  className={cn(
                    MARKER,
                    "absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer text-[11px] shadow-[0_1px_3px_rgb(0_0_0/0.35)] ring-2 ring-background transition-transform duration-150 focus-visible:outline-none motion-reduce:transition-none",
                    on ? "z-10 scale-125 ring-[3px]" : "hover:scale-110",
                  )}
                  style={{ left: at.left, top: at.top, background: ACCENT }}
                >
                  {numbers[index]}
                </button>
              );
            })}
            <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-border shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
              <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1)} disabled={view !== null && view.zoom >= MAX_ZOOM} className={CONTROL}>
                <Icon name="Plus" className="size-4" />
              </button>
              <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(-1)} className={cn(CONTROL, "border-y border-border")}>
                <Icon name="Minus" className="size-4" />
              </button>
              <button type="button" aria-label="Show every place" title="Show every place" onClick={showAll} className={CONTROL}>
                <Icon name="Maximize2" className="size-4" />
              </button>
            </div>
            <p className="absolute bottom-0 right-0 m-0 rounded-tl-md bg-background/85 px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground">
              ©{" "}
              <UrlLink href="https://www.openstreetmap.org/copyright" className="underline-offset-2 hover:text-foreground hover:underline">
                OpenStreetMap
              </UrlLink>{" "}
              contributors
            </p>
          </div>
        )}
        <ol
          ref={listRef}
          className={cn("m-0 flex min-w-0 list-none flex-col gap-0.5 p-0", !off && "@xl:max-h-[22rem] @xl:w-60 @xl:shrink-0 @xl:overflow-y-auto")}
        >
          {places.map((place, index) => {
            if (place === null) return null;
            const result = place.given === null ? lookups.get(lookupKey(place.name)) : undefined;
            // The backend says "couldn't find …" for a real miss; anything else is the lookup failing.
            const status =
              place.given !== null || result?.ok
                ? null
                : result === undefined
                  ? off
                    ? null
                    : "Locating…"
                  : result.off === true
                    ? null
                    : result.error.startsWith("couldn't find")
                      ? "Not found on the map"
                      : "Couldn't look this place up";
            const on = active === index;
            return (
              <li key={index} data-place={index}>
                <button
                  type="button"
                  aria-pressed={selected === index}
                  onClick={() => focusPlace(index)}
                  onPointerEnter={() => setHovered(index)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  className={cn(
                    "flex w-full min-w-0 cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    on ? "bg-surface-recessed" : "hover:bg-surface-recessed",
                  )}
                >
                  <span
                    className={cn(MARKER, "mt-px size-5 text-[10px] transition-opacity", points[index] === null && "opacity-45")}
                    style={{ background: ACCENT }}
                  >
                    {numbers[index]}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">{place.name}</span>
                    {place.note === null ? null : <span className="text-xs leading-4 text-muted-foreground">{place.note}</span>}
                    {status === null ? null : (
                      <span className={cn("text-[11px] leading-4 text-muted-foreground", status === "Locating…" && "animate-pulse motion-reduce:animate-none")}>{status}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
