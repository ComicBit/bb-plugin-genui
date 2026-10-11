// Entrance motion in the spirit of ChatGPT's generated UI: text fades in,
// rows and grid items rise in with a short stagger, charts draw, container
// heights glide. Every entrance plays once, when its element first mounts:
// nodes keep their React keys across re-evaluations, so state changes never
// replay it. Web Animations, not CSS classes, so no stylesheet is needed and
// nothing is left applied after the animation ends.
import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from "react";

/** Exponential ease-out: fast start, long soft landing. */
export const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

export interface Entrance {
  readonly keyframes: Keyframe[];
  readonly duration: number;
  readonly delay?: number;
  /** Delay by the element's place among the elements mounting in the same frame. */
  readonly stagger?: boolean;
}

/** Text and other prose. */
export const FADE: Entrance = { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 700 };

/** New table rows, grid items and list items. */
export const RISE: Entrance = {
  keyframes: [
    { opacity: 0, transform: "translateY(6px)" },
    { opacity: 1, transform: "none" },
  ],
  duration: 420,
  stagger: true,
};

/** Charts and other drawn data. */
export const CHART_DRAW_MS = 1800;

const STAGGER_MS = 45;
/** Items after this many start together, so a long table never trickles in. */
const STAGGER_STEPS = 6;

let staggerIndex = 0;

function staggerDelay(): number {
  if (staggerIndex === 0) requestAnimationFrame(() => (staggerIndex = 0));
  return Math.min(staggerIndex++, STAGGER_STEPS) * STAGGER_MS;
}

/** Live: follows the OS setting without a reload. */
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Until when (a `performance.now()` time) entrances stay still in a block.
 * BB's timeline unmounts rows that scroll out of view and remounts them on
 * the way back; a block that already played its entrance in this page sets
 * this just past its remount, so scrolling never replays it.
 */
export const EntranceContext = createContext<{ readonly quietUntil: number }>({ quietUntil: 0 });

/** Plays `entrance` on the returned ref's element when it mounts, and never again. */
export function useEntrance<T extends Element>(entrance: Entrance): RefObject<T | null> {
  const ref = useRef<T>(null);
  const { quietUntil } = useContext(EntranceContext);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || REDUCED_MOTION.matches || performance.now() < quietUntil) return;
    const animation = element.animate(entrance.keyframes, {
      duration: entrance.duration,
      delay: (entrance.delay ?? 0) + (entrance.stagger ? staggerDelay() : 0),
      easing: EASE_OUT_EXPO,
      fill: "backwards",
    });
    return () => animation.cancel();
    // Mount only: a later render must not replay the entrance.
  }, []);
  return ref;
}

/** When the user last pressed a pointer or a key. */
let lastInput = Number.NEGATIVE_INFINITY;
for (const type of ["pointerdown", "keydown"] as const) {
  addEventListener(type, () => (lastInput = performance.now()), { capture: true, passive: true });
}
/** A height change this soon after an input is the user's doing. */
const INPUT_WINDOW_MS = 1000;

/** Height keyframes may end at `auto` only where keywords interpolate. */
const SMOOTH_HEIGHT = CSS.supports("interpolate-size", "allow-keywords");

/** The class the outer element of `useSmoothHeight` needs. */
export const SMOOTH_HEIGHT_CLASS = "[interpolate-size:allow-keywords]";

/**
 * Glides `outer`'s height when `inner` (its content) grows or shrinks because
 * of something the user did (opening a detail, switching a tab). Changes
 * nobody asked for (a file or image arriving, a remount while scrolling, a
 * reply streaming in) snap: a box that glides on its own keeps moving the
 * conversation under the reader for its whole duration. The animation ends at
 * `height: auto`, so the box keeps following its content afterwards.
 */
export function useSmoothHeight<O extends HTMLElement, I extends HTMLElement>(): {
  outer: RefObject<O | null>;
  inner: RefObject<I | null>;
} {
  const outer = useRef<O>(null);
  const inner = useRef<I>(null);
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!SMOOTH_HEIGHT || box === null || content === null) return;
    let last = content.offsetHeight;
    let animation: Animation | null = null;
    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight;
      const delta = next - last;
      last = next;
      if (delta === 0 || REDUCED_MOTION.matches || performance.now() - lastInput > INPUT_WINDOW_MS) {
        animation?.cancel();
        animation = null;
        return;
      }
      // Mid-glide the box shows the animated height; otherwise it already has the new one.
      const height = box.getBoundingClientRect().height;
      const from = animation?.playState === "running" ? height : height - delta;
      animation?.cancel();
      animation = box.animate(
        [
          { height: `${from}px`, overflow: "clip" },
          { height: "auto", overflow: "clip" },
        ],
        { duration: 420, easing: EASE_OUT_EXPO },
      );
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      animation?.cancel();
    };
  }, []);
  return { outer, inner };
}
