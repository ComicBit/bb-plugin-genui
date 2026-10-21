// What pressing a control does, for the glyph at its end and its tooltip.
// Only actions that leave the block are named: a message to the agent, a link,
// a copy. Set only changes the block, where its effect shows anyway.
import type { Action } from "../../core/types";

/** The glyph of each action that leaves the block, by weight: a message, then a link, then a copy. */
const GLYPHS = [
  ["send", "Sent"],
  ["openUrl", "ExternalLink"],
  ["copy", "Copy"],
] as const satisfies readonly (readonly [Action["type"], string])[];

export type ActionGlyph = (typeof GLYPHS)[number][1];

/** Glyphs that name an action: a control draws one only for that action, so it never promises another. */
export const ACTION_GLYPHS: ReadonlySet<string> = new Set(GLYPHS.map(([, glyph]) => glyph));

/** How many characters of a sent or copied text, or of a link, a hint shows. */
const HINT_TEXT_MAX = 200;

export interface ActionIntent {
  /** BB's icon for what pressing does; null when it only changes this UI. */
  readonly glyph: ActionGlyph | null;
  /** What pressing does in words, one line per action that leaves this UI; null when none does. */
  readonly hint: string | null;
}

/**
 * What pressing a control running `actions` does. `shown` is the text the
 * control already shows (its label): a message or copy of that same text is
 * not quoted again, and the hint says where it goes instead. A link is always
 * spelled out, since its label can say anything.
 */
export function actionIntent(actions: readonly Action[], shown?: string): ActionIntent {
  const glyph = GLYPHS.find(([type]) => actions.some((action) => action.type === type))?.[1] ?? null;
  const visible = shown === undefined ? null : words(shown);
  const lines = actions.flatMap((action) => {
    switch (action.type) {
      case "send":
        return [words(action.text) === visible ? "Send as your reply" : `Send “${clip(action.text)}”`];
      case "openUrl":
        return [`Open ${clip(linkTarget(action.url))}`];
      case "copy":
        return [words(action.text) === visible ? "Copy to the clipboard" : `Copy “${clip(action.text)}”`];
      case "set":
        return [];
    }
  });
  return { glyph, hint: lines.length === 0 ? null : lines.join("\n") };
}

/** `text` as a label reads: whitespace runs as one space, and no closing full stop ("Go with BullMQ." is Decision's "Go with BullMQ"). */
function words(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

/**
 * The address the browser opens, as LiveUi parses it, so punycode and escapes
 * show what it really is. A user name and password are left out, as browsers
 * show addresses: `https://github.com@evil.com/` reads `https://evil.com/`.
 */
function linkTarget(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.href;
  } catch {
    return url;
  }
}

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** `text` trimmed and, past HINT_TEXT_MAX characters, cut after a whole word with an ellipsis. */
function clip(text: string): string {
  // Characters as the reader sees them: a flag or a family emoji is one, never cut in half.
  const characters = Array.from(GRAPHEMES.segment(text.trim()), (part) => part.segment);
  if (characters.length <= HINT_TEXT_MAX) return characters.join("");
  const cut = characters.slice(0, HINT_TEXT_MAX).join("");
  // A cut that falls just before a space already ends on a whole word.
  const space = /\s/.test(characters[HINT_TEXT_MAX]) ? cut.length : cut.search(/\s\S*$/);
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
