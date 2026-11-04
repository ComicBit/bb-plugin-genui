// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LooseTagsOverlay } from "./LooseTagsOverlay";

vi.mock("@get-bb/plugin-sdk/app", () => ({ experimental_usePluginId: () => "genui" }));
vi.mock("./Fence", () => ({
  useThreadActions: () => ({}),
  Fence: ({ code }: { code: string }) => <button>{code}</button>,
}));

function paragraph(text: string, thread = "a", role = "assistant") {
  const row = document.createElement("div");
  row.setAttribute("data-timeline-row-id", `${thread}:${role}:1`);
  const p = document.createElement("p");
  p.textContent = text;
  row.append(p);
  document.body.append(row);
  return row;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const SOURCES = '<Sources links={[{url: "https://www.viture.com/beast", title: "VITURE Beast"}]} />';

describe("loose component tag overlay", () => {
  it("hides a loose tag and renders its spec in place", async () => {
    const row = paragraph(SOURCES);
    render(<LooseTagsOverlay threadId="a" />);
    await waitFor(() => expect(row.querySelector("[data-genui-loose]")).not.toBeNull());
    const p = row.querySelector("p")!;
    expect(p.hasAttribute("data-genui-hidden-tag")).toBe(true);
    expect(p.style.display).toBe("none");
    expect(row.querySelector("button")!.textContent).toBe(
      'Sources(links: [{url: "https://www.viture.com/beast", title: "VITURE Beast"}])',
    );
  });

  it("leaves prose, user messages and other threads alone", async () => {
    const own = paragraph("Смотрю источники.", "a");
    const foreign = paragraph(SOURCES, "b");
    const user = paragraph(SOURCES, "a", "user");
    render(<LooseTagsOverlay threadId="a" />);
    await act(async () => {});
    expect(own.querySelector("[data-genui-loose]")).toBeNull();
    expect(own.querySelector("p")!.style.display).toBe("");
    expect(foreign.querySelector("[data-genui-loose]")).toBeNull();
    expect(user.querySelector("[data-genui-loose]")).toBeNull();
  });

  it("does not adopt a tag that fails to compile", async () => {
    const row = paragraph("<Metric label=\"Uplink\" />");
    render(<LooseTagsOverlay threadId="a" />);
    await act(async () => {});
    expect(row.querySelector("[data-genui-loose]")).toBeNull();
    expect(row.querySelector("p")!.style.display).toBe("");
  });

  it("skips paragraphs inside its own renders", async () => {
    const row = paragraph("intro", "a");
    const mount = document.createElement("div");
    mount.setAttribute("data-genui-loose", "");
    mount.innerHTML = '<p><Sources links={[]} /></p>';
    row.append(mount);
    render(<LooseTagsOverlay threadId="a" />);
    await act(async () => {});
    expect(row.querySelectorAll("[data-genui-loose]")).toHaveLength(1);
  });

  it("picks up a tag that finishes streaming later", async () => {
    const row = paragraph("Смотрю источники:");
    render(<LooseTagsOverlay threadId="a" />);
    await act(async () => {});
    expect(row.querySelector("[data-genui-loose]")).toBeNull();
    await act(async () => {
      row.querySelector("p")!.textContent = SOURCES;
    });
    await waitFor(() => expect(row.querySelector("[data-genui-loose]")).not.toBeNull());
  });
});
