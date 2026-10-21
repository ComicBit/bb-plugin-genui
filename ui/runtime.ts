import { createContext, useContext } from "react";
import type { Action, Value } from "../core/types";

/**
 * An image as a URL the page can show, or a user-facing reason it can't be
 * shown; `off` when it is an https image and the webLookups setting is off.
 */
export type ImageUrl =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly error: string; readonly off?: boolean };

/** A picture's natural size, in CSS px. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Reads an image (see `UiRuntime.loadImage`), and answers at once what the
 * page already knows about one, so a block BB remounts (scrolled back to, or
 * its thread opened again) opens at its final size instead of growing when
 * its pictures arrive.
 */
export interface ImageLoader {
  (src: string): Promise<ImageUrl>;
  /** `src` as this page already read it; null when it hasn't (yet). */
  peek(src: string): ImageUrl | null;
  /** The natural size `src` last decoded at, in this page or an earlier one; null when it never did. */
  size(src: string): ImageSize | null;
  /** Remembers the natural size `src` decoded at, for `size`. */
  rememberSize(src: string, size: ImageSize): void;
  /** Drops `src` as this page read it, when the browser couldn't decode it, so the next mount reads it again. */
  forget(src: string): void;
}

/** A text file read for a component, or a user-facing reason it couldn't be. */
export type TextFile = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/** A binary file read for a component (a Scene's model, environment or texture), or a user-facing reason it couldn't be. */
export type AssetBytes =
  | { readonly ok: true; readonly bytes: ArrayBuffer; readonly type: string }
  | { readonly ok: false; readonly error: string };

/** What rendered components may do to their UI: local state, actions, files. */
export interface UiRuntime {
  setValue(name: string, value: Value): void;
  /** Runs actions in order; failures are reported to the user, never thrown. */
  run(actions: readonly Action[]): Promise<void>;
  /** Opens a workspace file, at `line` when given; null where the surface has no file viewer. */
  openFile: ((path: string, line?: number) => boolean | Promise<boolean>) | null;
  /**
   * Reads an image: a file of the thread (workspace or `$BB_THREAD_STORAGE/…`)
   * or an https URL, fetched by the backend's address-checked proxy. Use it
   * for every image rather than putting an https URL in an <img>. Null where
   * the surface can't load images. Never rejects.
   */
  loadImage: ImageLoader | null;
  /**
   * Marks something the UI shows as still arriving (an image being read or
   * decoded): until every mark is released, the block keeps the height it last
   * settled at and remembers no other (reservedHeight.ts). Returns the release.
   */
  holdHeight(): () => void;
  /**
   * Reads a text file of the thread (workspace, `$BB_THREAD_STORAGE/…` or
   * /tmp; the gallery's own files in the gallery), for components that show
   * code at a location found in their data: a stack frame, a finding, an
   * uncovered line. Null where the surface can't read files. Never rejects.
   */
  readText: ((path: string) => Promise<TextFile>) | null;
  /**
   * Reads a recording of the thread (wav, mp3, m4a, aac, ogg, flac, webm or
   * caf; 25 MB cap; the gallery's own files in the gallery) as a URL an
   * <audio> can play. Null where the surface can't load files. Never rejects.
   */
  loadAudio: ((src: string) => Promise<ImageUrl>) | null;
  /**
   * Reads a file a Scene names (glb, gltf, hdr, png, jpg or webp; 10 MB cap;
   * the gallery's own files in the gallery) as bytes and our MIME type for
   * it. Null where the surface can't load files. Never rejects.
   */
  loadAsset: ((src: string) => Promise<AssetBytes>) | null;
  /**
   * The message the user sent from this block (a Send action or a Form),
   * persisted per block; null until then. Choice controls collapse to it.
   */
  answer: string | null;
  /**
   * True once the thread has a user message after the reply holding this
   * block (typed, or sent from any UI): its choices are no longer the question.
   */
  superseded: boolean;
  /**
   * The thread whose reply holds this UI: what components that read BB's own
   * state (the checkout's changes, subthreads) read it for. Null where there
   * is no thread (the gallery without `?thread=`).
   */
  threadId: string | null;
  /**
   * Stable identity of this block (one reply's one UI), for data a component
   * snapshots the first time it renders so an old reply keeps meaning what
   * it meant. Null where nothing should persist (the gallery).
   */
  blockKey: string | null;
}

export const UiRuntimeContext = createContext<UiRuntime | null>(null);

export function useUiRuntime(): UiRuntime {
  const runtime = useContext(UiRuntimeContext);
  if (runtime === null) throw new Error("useUiRuntime used outside a rendered UI");
  return runtime;
}

/**
 * How many Cards enclose the current node. The outermost Card is the UI's
 * frame; nested Cards render as flat tiles, never as boxes inside boxes.
 */
export const CardDepthContext = createContext(0);

/** True inside a Table cell, where Badges render as a status dot plus text. */
export const InTableContext = createContext(false);
