// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as PluginSdkApp from "@get-bb/plugin-sdk/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderFailure } from "./LiveUi";
import { ComposerGuard, FixRequestButton } from "./FixRequestButton";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  toast: vi.fn(),
  useComposer: () => ({ insert: mocks.insert }),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => ({
  ...(await importOriginal<typeof PluginSdkApp>()),
  useComposers: () => [],
  useComposer: mocks.useComposer,
  useSdk: () => ({ threads: { send: vi.fn() } }),
  useBbNavigate: () => ({}),
  useRpc: () => ({ call: vi.fn() }),
  useSettings: () => ({ values: { animations: false }, isLoading: false }),
  Markdown: ({ content }: { content: string }) => <p>{content}</p>,
  experimental_Icon: () => <span aria-hidden="true" />,
}));
vi.mock("./useSuperseded", () => ({ useSuperseded: () => false, useReplyIndex: () => 0 }));
vi.mock("./render", () => ({ RenderNodes: () => null }));
vi.mock("./webLookups", () => ({ foundImages: () => [], foundWikiPhotos: () => [] }));

const DIAGS = [{ severity: "error" as const, line: 1, column: 4, message: "boom" }];

afterEach(() => {
  cleanup();
  mocks.insert.mockClear();
  mocks.toast.mockClear();
});

describe("RenderFailure fix request", () => {
  it("renders the staged fix-request button and it writes into the composer", () => {
    render(
      <RenderFailure
        source="$п areas = [1]"
        diagnostics={DIAGS}
        fixRequest={
          <ComposerGuard fallback={null}>
            <FixRequestButton request="Fix this ui block — it fails to render:\n1:4 error: …" />
          </ComposerGuard>
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fix this block/i }));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(String(mocks.insert.mock.calls[0][0])).toContain("Fix this ui block");
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("shows nothing where there is no composer runtime (guard fallback)", () => {
    render(
      <RenderFailure
        source="$x = 1"
        diagnostics={DIAGS}
        fixRequest={
          <ComposerGuard fallback={null}>
            <BrokenComposer />
          </ComposerGuard>
        }
      />,
    );
    expect(screen.queryByRole("button", { name: /Fix this block/i })).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("renders no fix button when none is provided (gallery)", () => {
    render(<RenderFailure source="$x = 1" diagnostics={DIAGS} />);
    expect(screen.queryByRole("button", { name: /Fix this block/i })).toBeNull();
  });
});

/** A button whose hook throws the way useComposer does without the plugin runtime. */
function BrokenComposer(): null {
  throw new Error("useComposer needs the bb app's plugin runtime");
}
