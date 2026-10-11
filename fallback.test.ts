import { describe, expect, it } from "vitest";
import type { DataRequest, LoadedData } from "./core";
import { renderReplyMarkdown } from "./fallback";

const reply = [
  "Pro costs **$290** a month for 10 seats.",
  "",
  "```ui",
  "$seats = 10",
  'Card("Monthly estimate", [Metric("Total", "$" + 29 * $seats)])',
  "```",
  "",
  "```ts",
  "const keep = true;",
  "```",
  "",
  "````app",
  "<title>Bouncing ball</title><canvas></canvas>",
  "````",
  "Done.",
].join("\n");

describe("renderReplyMarkdown", () => {
  it("replaces ui and app fences and leaves prose and other fences alone", async () => {
    const markdown = await renderReplyMarkdown(reply, async () => ({ ok: false, error: "unused" }));
    expect(markdown).toContain("Pro costs **$290** a month for 10 seats.");
    expect(markdown).toContain("**Monthly estimate**");
    expect(markdown).toContain("Total **$290**");
    expect(markdown).not.toContain("```ui");
    expect(markdown).toContain("```ts\nconst keep = true;\n```");
    expect(markdown).toContain("_Interactive app: Bouncing ball. Open this reply in BB to use it._");
    expect(markdown.endsWith("Done.")).toBe(true);
  });

  it("loads the files a spec references", async () => {
    const requested: DataRequest[] = [];
    const spec = ["```ui", 'rows = Load("bench.json")', 'Card("Bench", [Table(["Name"], rows.map(r => [r.name]))])', "```"].join("\n");
    const markdown = await renderReplyMarkdown(spec, async (request): Promise<LoadedData> => {
      requested.push(request);
      return { ok: true, value: [{ name: "parse" }, { name: "render" }] };
    });
    expect(requested).toEqual([{ path: "bench.json", raw: false }]);
    expect(markdown).toContain("| parse |");
    expect(markdown).toContain("| render |");
  });

  it("fetches Snippet files as raw text, apart from parsed loads of the same file", async () => {
    const requested: DataRequest[] = [];
    const spec = ["```ui", 'Card("Config", [Snippet("cfg.json", 2, 2), Text(Load("cfg.json").name)])', "```"].join("\n");
    const markdown = await renderReplyMarkdown(spec, async (request): Promise<LoadedData> => {
      requested.push(request);
      return request.raw ? { ok: true, value: '{\n  "name": "genui"\n}\n' } : { ok: true, value: { name: "genui" } };
    });
    expect(requested).toEqual([
      { path: "cfg.json", raw: true },
      { path: "cfg.json", raw: false },
    ]);
    expect(markdown).toContain('"name": "genui"');
    expect(markdown).not.toContain("error");
  });

  it("returns text without ui or app fences unchanged", async () => {
    const text = "Plain answer.\n\n```js\nx()\n```";
    expect(await renderReplyMarkdown(text, async () => ({ ok: false, error: "" }))).toBe(text);
  });
});
