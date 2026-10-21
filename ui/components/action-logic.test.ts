import { describe, expect, it } from "vitest";
import type { Action } from "../../core/types";
import { ACTION_GLYPHS, actionIntent } from "./action-logic";

const send = (text: string): Action => ({ kind: "action", type: "send", text });
const open = (url: string): Action => ({ kind: "action", type: "openUrl", url });
const copy = (text: string): Action => ({ kind: "action", type: "copy", text });
const set = (name: string, value: string): Action => ({ kind: "action", type: "set", name, value });

describe("actionIntent", () => {
  it("names each action that leaves the block with its glyph and what it carries", () => {
    expect(actionIntent([send("Open a PR for this branch")])).toEqual({ glyph: "Sent", hint: "Send “Open a PR for this branch”" });
    expect(actionIntent([open("https://example.com/docs")])).toEqual({ glyph: "ExternalLink", hint: "Open https://example.com/docs" });
    expect(actionIntent([copy("fix/upload-race")])).toEqual({ glyph: "Copy", hint: "Copy “fix/upload-race”" });
  });

  it("doesn't quote the text the control already shows, and says where it goes instead", () => {
    expect(actionIntent([send("Use Redis")], "Use Redis").hint).toBe("Send as your reply");
    expect(actionIntent([send(" Use\n Redis ")], "Use Redis").hint).toBe("Send as your reply");
    expect(actionIntent([send("Go with BullMQ.")], "Go with BullMQ").hint).toBe("Send as your reply");
    expect(actionIntent([send("Go with BullMQ. My weights: Throughput 3.")], "Go with BullMQ").hint).toBe(
      "Send “Go with BullMQ. My weights: Throughput 3.”",
    );
    expect(actionIntent([copy("fix/upload-race")], "fix/upload-race").hint).toBe("Copy to the clipboard");
    expect(actionIntent([send("Open a PR for this branch")], "Open the PR").hint).toBe("Send “Open a PR for this branch”");
    expect(actionIntent([open("https://example.com/")], "https://example.com/").hint).toBe("Open https://example.com/");
  });

  it("says nothing for a button that only changes this UI", () => {
    expect(actionIntent([set("plan", "Pro")])).toEqual({ glyph: null, hint: null });
    expect(actionIntent([])).toEqual({ glyph: null, hint: null });
  });

  it("draws the weightiest action's glyph and lists every outward action in order", () => {
    expect(actionIntent([set("plan", "Pro"), copy("PRO-2026"), open("https://example.com/upgrade"), send("Go with Pro")])).toEqual({
      glyph: "Sent",
      hint: "Copy “PRO-2026”\nOpen https://example.com/upgrade\nSend “Go with Pro”",
    });
    expect(actionIntent([copy("token"), open("https://example.com/settings")]).glyph).toBe("ExternalLink");
  });

  it("shows the address the browser opens, so a look-alike host reads as what it is", () => {
    expect(actionIntent([open("https://Example.com/a b")]).hint).toBe("Open https://example.com/a%20b");
    expect(actionIntent([open("https://аpple.com/")]).hint).toBe("Open https://xn--pple-43d.com/");
    expect(actionIntent([open("https://github.com@evil.com/login")]).hint).toBe("Open https://evil.com/login");
    expect(actionIntent([open("https://me:secret@example.com/")]).hint).toBe("Open https://example.com/");
    expect(actionIntent([open("not a url")]).hint).toBe("Open not a url");
  });

  it("cuts a long text at a word, and keeps the lines of a multi-line one", () => {
    const hint = actionIntent([send(`Update these dependencies: ${"vitest 4.0.1 → 4.1.0, ".repeat(20)}then run the tests.`)]).hint!;
    expect(hint.length).toBeLessThan(220);
    expect(hint).toMatch(/^Send “Update these dependencies: vitest 4\.0\.1 → 4\.1\.0, .*\S…”$/);
    expect(hint).not.toMatch(/ …”$/);
    expect(actionIntent([send("  Which channels?: Email\nAnything else?: no  ")]).hint).toBe("Send “Which channels?: Email\nAnything else?: no”");
  });

  it("keeps a text of 200 characters whole, and cuts at 201", () => {
    expect(actionIntent([copy("a".repeat(200))]).hint).toBe(`Copy “${"a".repeat(200)}”`);
    expect(actionIntent([copy("a".repeat(201))]).hint).toBe(`Copy “${"a".repeat(200)}…”`);
  });

  it("keeps the last word when the cut falls just before a space", () => {
    const words = `${"word ".repeat(39)}last1 more`;
    expect(Array.from(words.slice(0, 200)).length).toBe(200);
    expect(actionIntent([send(words)]).hint).toBe(`Send “${"word ".repeat(39)}last1…”`);
  });

  it("never cuts a character in half, as the reader sees characters", () => {
    expect(actionIntent([copy("🙂".repeat(300))]).hint).toBe(`Copy “${"🙂".repeat(200)}…”`);
    const family = "👨‍👩‍👧";
    expect(actionIntent([copy(`${"a".repeat(199)}${family}${"b".repeat(5)}`)]).hint).toBe(`Copy “${"a".repeat(199)}${family}…”`);
    expect(actionIntent([copy(`${"a".repeat(199)}🇫🇷b`)]).hint).toBe(`Copy “${"a".repeat(199)}🇫🇷…”`);
  });

  it("reserves exactly the glyphs it draws", () => {
    expect([...ACTION_GLYPHS].sort()).toEqual(["Copy", "ExternalLink", "Sent"]);
  });
});
