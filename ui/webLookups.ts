// The page side of the backend's web lookups (web/lookups.ts): photo
// searches, place names and map tiles. Answers are kept for the page's
// lifetime, so a UI that re-renders, a Gallery that repeats a search or a map
// panned back over the same streets asks the backend once.
import { useEffect, useState } from "react";
import { useRpc, type PluginRpcClient } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import type { FoundImage } from "../web/commons";

export type { FoundImage } from "../web/commons";

type Rpc = PluginRpcClient<typeof rpcContract>;
type Failure = { readonly ok: false; readonly error: string; readonly off?: boolean };
export type SearchResult = { readonly ok: true; readonly image: FoundImage } | Failure;
export type PlaceResult = { readonly ok: true; readonly lat: number; readonly lng: number } | Failure;

function failure(cause: unknown): Failure {
  return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
}

/** Remembers successes for the page's lifetime; failures are dropped so a later render retries. */
function remember<T extends { readonly ok: boolean }>(cache: Map<string, Promise<T | Failure>>, key: string, fetch: () => Promise<T>) {
  const known = cache.get(key);
  if (known !== undefined) return known;
  const pending = fetch().catch(failure);
  cache.set(key, pending);
  void pending.then((result) => {
    if (!result.ok) cache.delete(key);
  });
  return pending;
}

const searches = new Map<string, Promise<SearchResult>>();

/** The photo found for `query`; null while searching or when `query` is empty. */
export function useImageSearch(query: string): SearchResult | null {
  const rpc = useRpc<typeof rpcContract>();
  const key = query.trim().replace(/\s+/g, " ").toLowerCase();
  const [result, setResult] = useState<{ readonly key: string; readonly result: SearchResult } | null>(null);
  useEffect(() => {
    if (key === "") return;
    let live = true;
    void remember(searches, key, () => rpc.call("web_search", { query: key })).then((found) => {
      if (live) setResult({ key, result: found });
    });
    return () => {
      live = false;
    };
  }, [rpc, key]);
  return result !== null && result.key === key ? result.result : null;
}

const places = new Map<string, Promise<PlaceResult>>();

/** Coordinates for a place name, nudged toward `near`. */
export function geocode(rpc: Rpc, name: string, near: { lat: number; lng: number } | null): Promise<PlaceResult> {
  const bias = near === null ? "" : `${near.lat.toFixed(1)},${near.lng.toFixed(1)}`;
  return remember(places, `${name.trim().toLowerCase()}|${bias}`, () => rpc.call("web_geocode", { name: name.trim(), near }));
}

/** Tiles the page holds decoded data URLs for: the last few hundred viewed. */
const TILE_LIMIT = 400;
const tileUrls = new Map<string, string>();
const tileRequests = new Map<string, Promise<{ readonly ok: true; readonly dataUrl: string } | Failure>>();

/** A tile already fetched in this page, without fetching; null otherwise. */
export function cachedTile(z: number, x: number, y: number): string | null {
  return tileUrls.get(`${z}/${x}/${y}`) ?? null;
}

/** One map tile as a data URL. */
export async function loadTile(rpc: Rpc, z: number, x: number, y: number): Promise<{ readonly ok: true; readonly dataUrl: string } | Failure> {
  const key = `${z}/${x}/${y}`;
  const known = tileUrls.get(key);
  if (known !== undefined) return { ok: true, dataUrl: known };
  const result = await remember(tileRequests, key, () => rpc.call("web_tile", { z, x, y }));
  tileRequests.delete(key);
  if (result.ok) {
    tileUrls.set(key, result.dataUrl);
    // Map keeps insertion order: the first key is the oldest.
    if (tileUrls.size > TILE_LIMIT) tileUrls.delete(tileUrls.keys().next().value ?? key);
  }
  return result;
}
