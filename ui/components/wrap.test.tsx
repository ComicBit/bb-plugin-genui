// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type * as PluginSdkApp from "@get-bb/plugin-sdk/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplySource } from "../FrameFooter";
import { UiRuntimeContext, type UiRuntime } from "../runtime";
import { Code, Diff } from "./code";
import { CodeExcerpt } from "./codeHealthKit";

vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => ({
  ...(await importOriginal<typeof PluginSdkApp>()),
  experimental_Icon: () => <span aria-hidden="true" />,
  experimental_SourceCode: ({ content, overflow }: { content: string; overflow: string }) => <pre data-overflow={overflow}>{content}</pre>,
  experimental_Diff: ({ patch, overflow }: { patch: string; overflow: string }) => <pre data-overflow={overflow}>{patch}</pre>,
}));

const runtime = { blockKey: "thread:assistant:1:0", run: vi.fn(), openFile: null } as unknown as UiRuntime;
const PATCH = "--- a/notes.md\n+++ b/notes.md\n@@ -1 +1 @@\n-old line\n+a new line that is long enough to need wrapping";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  localStorage.clear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

const LONG_LINE = "  return clampView({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, size); // long enough to need wrapping";

function show(block: "code" | "diff" | "excerpt"): void {
  const shown = {
    code: <Code props={{ code: "const a = 1;", language: "ts" }} />,
    diff: <Diff props={{ patch: PATCH }} />,
    excerpt: <CodeExcerpt path="src/map.ts" file={{ ok: true, text: `const a = 1;\n${LONG_LINE}\n` }} mark={{ start: 2, end: 2 }} tone="bad" />,
  }[block];
  act(() => root.render(<UiRuntimeContext.Provider value={runtime}>{shown}</UiRuntimeContext.Provider>));
}

const excerptLine = () => [...container.querySelectorAll("span")].find((span) => span.textContent === LONG_LINE)!;
const excerptOverflow = () => (excerptLine().className.includes("whitespace-pre-wrap") ? "wrap" : "scroll");
const viewerOverflow = () => container.querySelector("pre")?.dataset.overflow ?? excerptOverflow();
const wrapButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="Wrap lines"]')!;

describe.each(["code", "diff", "excerpt"] as const)("Wrap lines in a %s block", (block) => {
  it("scrolls long lines until the user turns wrapping on, and back off", () => {
    show(block);
    expect(viewerOverflow()).toBe("scroll");
    expect(wrapButton().getAttribute("aria-pressed")).toBe("false");

    act(() => wrapButton().click());
    expect(viewerOverflow()).toBe("wrap");
    expect(wrapButton().getAttribute("aria-pressed")).toBe("true");

    act(() => wrapButton().click());
    expect(viewerOverflow()).toBe("scroll");
  });

  it("keeps the choice when BB remounts the block", () => {
    show(block);
    act(() => wrapButton().click());
    act(() => root.unmount());
    root = createRoot(container);
    show(block);
    expect(viewerOverflow()).toBe("wrap");
  });
});

describe("Wrap lines in a reply's source panel", () => {
  it("wraps the spec's long lines while the panel is open", () => {
    act(() => root.render(<ReplySource source={`Text("${"long ".repeat(40)}")`} language="ui" files={[]} diagnostics={[]} />));
    act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Source")!.click());
    expect(viewerOverflow()).toBe("scroll");

    act(() => wrapButton().click());
    expect(viewerOverflow()).toBe("wrap");
    expect(wrapButton().getAttribute("aria-pressed")).toBe("true");
  });
});
