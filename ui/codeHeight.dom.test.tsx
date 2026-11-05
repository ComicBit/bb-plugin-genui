// @vitest-environment jsdom
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCodeHeight } from "./codeHeight";

let container: HTMLDivElement;
let root: Root;
let resize: (height: number, borderBox?: boolean) => void;

function Body({ lines, loading, cap = 384 }: { lines: number; loading: boolean; cap?: number }) {
  const body = useRef<HTMLDivElement>(null);
  useCodeHeight(body, lines);
  return (
    <div ref={body} style={{ maxHeight: cap }}>
      {loading ? <div className="animate-pulse" /> : createElement("diffs-container")}
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  // One entry left by the earlier implementation cannot predict another length yet.
  localStorage.setItem("bb.genui.codeHeights", JSON.stringify([[3, 86]]));
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(element: Element) {
      resize = (height, borderBox = true) => this.callback([{
        target: element,
        borderBoxSize: borderBox ? [{ inlineSize: 400, blockSize: height }] : undefined,
        contentRect: new DOMRect(0, 0, 400, height),
      } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reuses exact reserves, learns observer sizes, and releases loading heights when content arrives", async () => {
  const getStyle = globalThis.getComputedStyle;
  const styles = vi.spyOn(globalThis, "getComputedStyle");
  styles.mockImplementation(() => {
    throw new Error("An exact stored height needs no computed style read");
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => {
    throw new Error("ResizeObserver already supplied the body height");
  });
  act(() => root.render(<Body lines={3} loading cap={64} />));
  const box = container.firstElementChild as HTMLDivElement;
  expect(box.style.height).toBe("86px");
  expect(box.style.overflow).toBe("hidden");
  act(() => root.render(<Body lines={3} loading cap={128} />));
  expect(box.style.height).toBe("86px");
  expect(styles).not.toHaveBeenCalled();

  act(() => root.render(<Body lines={5} loading />));
  expect(box.style.height).toBe("");
  expect(styles).not.toHaveBeenCalled();

  await act(async () => root.render(<Body lines={5} loading={false} />));
  act(() => resize(122));
  expect(styles).not.toHaveBeenCalled();
  styles.mockImplementation(getStyle);

  act(() => root.render(<Body lines={4} loading />));
  expect(box.style.height).toBe("104px");
  expect(box.style.overflow).toBe("hidden");
  expect(styles).toHaveBeenCalledTimes(1);

  await act(async () => root.render(<Body lines={4} loading={false} />));
  expect(box.style.height).toBe("");
  expect(box.style.overflow).toBe("");
  // Older browsers without a border-box size still supply the same unpadded body height.
  act(() => resize(106, false));
  act(() => root.render(<Body lines={3} loading />));
  expect(box.style.height).toBe("86px");
  act(() => root.render(<Body lines={4} loading />));
  expect(box.style.height).toBe("106px");

  act(() => root.render(<Body lines={10} loading cap={108} />));
  expect(box.style.height).toBe("108px");
});
