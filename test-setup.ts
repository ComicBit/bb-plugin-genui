import { afterAll, vi } from "vitest";

// jsdom and Node lack the browser feature detection read at module load.
if (typeof matchMedia === "undefined") {
  vi.stubGlobal("matchMedia", (media: string): MediaQueryList => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  }));
}
if (typeof CSS === "undefined") {
  vi.stubGlobal("CSS", { supports: () => false });
}
afterAll(() => vi.unstubAllGlobals());
