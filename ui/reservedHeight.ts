// Each rendered UI's height as it last settled, per block and width, kept in
// localStorage. When a thread opens on a fresh page (the app started, the
// plugin reloaded), a block holds that height while the files it reads, its
// images and BB's answers arrive, so the reply is laid out at its final size
// at once instead of growing under the reader. Within a page, useLoadedData's
// cache already renders remounted blocks complete.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "bb.genui.heights";
/** Blocks remembered, most recently settled kept. */
export const MAX_BLOCKS = 400;
/** Widths this close lay a block out alike. */
const WIDTH_TOLERANCE = 4;
/** A reservation the content hasn't filled by then is dropped: it is shorter now. */
const RESERVE_MS = 4000;
const PERSIST_MS = 500;

/** `[width, height]` in CSS px. */
type Entry = readonly [number, number];

/** What the store remembers, oldest first; `read` validates a stored copy. */
export class HeightStore {
  private readonly entries = new Map<string, Entry>();

  constructor(readonly max = MAX_BLOCKS) {}

  /** The height `key` settled at, when it was laid out at about `width`; any width when `width` is null. */
  get(key: string, width: number | null = null): number | null {
    const entry = this.entries.get(key);
    if (entry === undefined) return null;
    return width === null || Math.abs(entry[0] - width) <= WIDTH_TOLERANCE ? entry[1] : null;
  }

  set(key: string, width: number, height: number): void {
    this.entries.delete(key);
    this.entries.set(key, [Math.round(width), Math.round(height)]);
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
  }

  serialize(): string {
    return JSON.stringify([...this.entries]);
  }

  /** Entries from `serialize`; anything malformed is skipped. */
  static read(raw: string | null, max = MAX_BLOCKS): HeightStore {
    const store = new HeightStore(max);
    let parsed: unknown = null;
    try {
      parsed = raw === null ? null : JSON.parse(raw);
    } catch {
      // A damaged copy is an empty one.
    }
    if (!Array.isArray(parsed)) return store;
    for (const item of parsed) {
      if (!Array.isArray(item) || typeof item[0] !== "string" || !Array.isArray(item[1])) continue;
      const [width, height] = item[1] as unknown[];
      if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) store.set(item[0], width, height);
    }
    return store;
  }
}

let shared: HeightStore | null = null;
let persistTimer: number | undefined;

function heights(): HeightStore {
  if (shared === null) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: nothing is remembered across pages.
    }
    shared = HeightStore.read(raw);
  }
  return shared;
}

function remember(key: string, width: number, height: number): void {
  const store = heights();
  if (store.get(key, width) === Math.round(height)) return;
  store.set(key, width, height);
  persistTimer ??= window.setTimeout(() => {
    persistTimer = undefined;
    try {
      localStorage.setItem(STORAGE_KEY, store.serialize());
    } catch {
      // Storage full or unavailable: the heights hold for this page only.
    }
  }, PERSIST_MS);
}

/**
 * For a block keyed `key` whose files are `loading`: `content` goes on the
 * element wrapping what it renders (its natural height is what is remembered)
 * and `minHeight` on that element's parent. The reservation ends once the
 * content reaches it, or after RESERVE_MS with nothing left loading.
 */
export function useReservedHeight(key: string, loading: boolean) {
  const [reserve, setReserve] = useState<number | null>(() => heights().get(key));
  const reserved = useRef(reserve);
  reserved.current = reserve;
  const isLoading = useRef(loading);
  isLoading.current = loading;
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const content = useCallback((element: HTMLDivElement | null) => setNode(element), []);

  useLayoutEffect(() => {
    if (node === null) return;
    const settle = (width: number, height: number) => {
      const held = reserved.current;
      if (held !== null && height >= held - 1) setReserve(null);
      // Heights seen while files load or under a reservation are not the block's own.
      if (!isLoading.current && (held === null || height >= held - 1)) remember(key, width, height);
    };
    // Laid out at another width (a narrower pane, a phone), the stored height doesn't apply.
    const width = node.getBoundingClientRect().width;
    if (reserved.current !== null && heights().get(key, width) === null) setReserve(null);
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      settle(box?.inlineSize ?? entry.contentRect.width, box?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, key]);

  // Content that is shorter now never reaches the reservation: drop it, and remember the new height.
  useEffect(() => {
    if (reserve === null || loading || node === null) return;
    const timer = window.setTimeout(() => {
      const box = node.getBoundingClientRect();
      setReserve(null);
      remember(key, box.width, box.height);
    }, RESERVE_MS);
    return () => clearTimeout(timer);
  }, [reserve, loading, node, key]);

  return { content, minHeight: reserve ?? undefined };
}
