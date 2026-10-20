// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type * as PluginSdkApp from "@get-bb/plugin-sdk/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalCodeFenceRendererProps } from "@get-bb/plugin-sdk/app";
import { SlotFence } from "./SlotFence";

// Only BB's runtime is replaced; compilation, Fence, AppBlock and diagnostics are real.
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => ({
  ...(await importOriginal<typeof PluginSdkApp>()),
  useComposers: () => [],
  useSdk: () => ({}),
  useBbNavigate: () => ({}),
  useRpc: () => ({ call: vi.fn() }),
  experimental_Icon: () => <span aria-hidden="true" />,
}));
vi.mock("./useSuperseded", () => ({ useSuperseded: () => false }));

let container: HTMLDivElement;
let root: Root;
const message = { id: "orbit:assistant:1", threadId: "orbit", turnId: "turn", projectId: "project" };
const html = '<button onclick="this.textContent=\'Started\'">Start Orbit</button>';
const original = () => <pre>{html}</pre>;

function render(language: "ui" | "app", status: ExperimentalCodeFenceRendererProps["status"], code: string): void {
  act(() => root.render(<SlotFence language={language} status={status} code={code} index={0} message={message} Original={original} />));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SlotFence completion", () => {
  it("starts a sandbox only after the app fence closes, without restarting it on a repeated closed update", () => {
    render("app", "streaming", html);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    render("app", "closed", html);
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(container.querySelector('[role="status"]')).toBeNull();
    render("app", "closed", html);
    expect(container.querySelector("iframe")).toBe(frame);
  });

  it("shows source instead of executing an app when a streaming reply ends without its closing fence", () => {
    render("app", "streaming", html);
    render("app", "unclosed", html);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("pre")).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it.each(["closed", "unclosed"] as const)("finalizes invalid UI diagnostics when the fence is %s", (status) => {
    render("ui", "streaming", "$seats = (");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    render("ui", status, "$seats = (");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
