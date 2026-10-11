import { describe, expect, it, vi } from "vitest";
import { buildSrcdoc, parseAppMessage, resolveTheme, themeCss } from "./AppBlock";

// Hoisted above the imports: Frame pulls in host-only modules the helpers never render.
vi.mock("./LiveUi", () => ({ Frame: () => null }));

const HOST: Record<string, string> = {
  "--background": " #fff ",
  "--foreground": "oklch(0.2 0 0)",
  "--surface-recessed": "#f4f4f4",
  "--primary": "#111",
  "--warning": "orange",
  "font-family": '"Inter Variable", sans-serif',
  "color-scheme": "light",
};

describe("resolveTheme", () => {
  const theme = resolveTheme((property) => HOST[property] ?? "");

  it("maps host properties onto the app's variable names, with fallbacks", () => {
    expect(theme["--background"]).toBe("#fff");
    expect(theme["--muted"]).toBe("#f4f4f4");
    expect(theme["--card"]).toBe("#fff");
    expect(theme["--accent"]).toBe("#111");
    expect(theme["--warning-text"]).toBe("orange");
    expect(theme["--font-sans"]).toBe('"Inter Variable", sans-serif');
    expect(theme["color-scheme"]).toBe("light");
  });

  it("prefers the timeline accent and omits unset variables", () => {
    const accented = resolveTheme((property) => ({ ...HOST, "--color-timeline-accent": "teal" })[property] ?? "");
    expect(accented["--accent"]).toBe("teal");
    expect("--font-mono" in theme).toBe(false);
  });

  it("drops values that could escape the theme style element", () => {
    const hostile = resolveTheme((property) =>
      property === "--foreground" ? "red}</style><script>alert(1)</script>" : (HOST[property] ?? ""),
    );
    expect("--foreground" in hostile).toBe(false);
  });
});

describe("buildSrcdoc", () => {
  const html = "<!doctype html><html><body><canvas></canvas><script>start()</script></body></html>";
  const srcdoc = buildSrcdoc(html, { "--background": "#fff", "color-scheme": "dark" });

  it("puts our doctype and the CSP before anything else, and the model's HTML last", () => {
    expect(srcdoc.startsWith("<!doctype html>\n<meta http-equiv=\"Content-Security-Policy\"")).toBe(true);
    expect(srcdoc).toContain("default-src 'none'; script-src 'unsafe-inline'");
    expect(srcdoc.endsWith(html)).toBe(true);
    expect(srcdoc.indexOf("<script>(function(){")).toBeLessThan(srcdoc.indexOf(html));
  });

  it("bakes the theme into the replaceable theme style", () => {
    expect(srcdoc).toContain(`<style id="genui-theme">${themeCss({ "--background": "#fff", "color-scheme": "dark" })}</style>`);
    expect(themeCss({ "--background": "#fff", "color-scheme": "dark" })).toBe(":root{--background:#fff;color-scheme:dark}");
  });
});

describe("parseAppMessage", () => {
  it("accepts the two message shapes", () => {
    expect(parseAppMessage({ source: "genui-app", type: "height", height: 312.5 })).toEqual({ type: "height", height: 312.5 });
    expect(parseAppMessage({ source: "genui-app", type: "error", message: "boom" })).toEqual({ type: "error", message: "boom" });
  });

  it("rejects anything else", () => {
    for (const data of [
      null,
      "height",
      [],
      { type: "height", height: 10 },
      { source: "other", type: "height", height: 10 },
      { source: "genui-app", type: "height", height: "10" },
      { source: "genui-app", type: "height", height: Number.NaN },
      { source: "genui-app", type: "height", height: -1 },
      { source: "genui-app", type: "height", height: 10, extra: true },
      { source: "genui-app", type: "error", message: 42 },
      { source: "genui-app", type: "theme", css: "" },
    ]) {
      expect(parseAppMessage(data)).toBeNull();
    }
  });

  it("caps error messages", () => {
    const message = parseAppMessage({ source: "genui-app", type: "error", message: "x".repeat(2000) });
    expect(message?.type === "error" && message.message.length).toBe(500);
  });
});
