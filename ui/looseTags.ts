// Component tags an agent typed straight into markdown, outside any ```ui
// fence — the classic is a `<Sources links={[…]} />` trailing a reply. BB
// renders the raw text, and neither the fence slot nor FenceOverlay sees
// paragraphs, so the reader sees code that was never meant as prose.
// looseTagSpec() recognizes one self-closing tag naming a catalog component
// and rewrites it as a single spec statement (`Sources(links: […])`);
// LooseTagsOverlay (ui/LooseTagsOverlay.tsx) feeds that through the normal
// Fence. Anything ambiguous — paired tags with children, lowercase or unknown
// names, prose around the tag, an attribute that never closes — stays the raw
// text the reader already sees.

import { COMPONENTS, type ComponentName } from "../core/catalog";

export interface LooseTag {
  readonly name: ComponentName;
  /** The equivalent spec statement, ready for compile(): `Sources(links: […])`. */
  readonly spec: string;
}

const TAG = /^<([A-Z][A-Za-z0-9]*)((?:\s[\s\S]*\S)?\s*)\/>$/;
const KEY = /[A-Za-z_][A-Za-z0-9_]*/y;
const BAREWORD = /\S+/y;

/**
 * Reads `<Name key={value} key="value" key=bareword … />` as one spec
 * statement. Attribute values keep their literal text — `{…}` braces are
 * stripped (they are the JSX spelling of the spec's own literals), quoted
 * strings and barewords pass through, so the result compiles only when it
 * really was a well-formed component call.
 */
export function looseTagSpec(text: string): LooseTag | null {
  const trimmed = text.trim();
  const match = TAG.exec(trimmed);
  if (match === null) return null;
  const name = match[1] as ComponentName;
  if (!Object.hasOwn(COMPONENTS, name)) return null;
  const attrs = parseAttrs(match[2] ?? "");
  if (attrs === null) return null;
  const args = attrs.map((attr) => `${attr.key}: ${attr.value}`).join(", ");
  return { name, spec: `${name}(${args})` };
}

interface Attr {
  readonly key: string;
  readonly value: string;
}

/** Scans `key={…} key="…" key=bareword …` left to right; null when it cannot close a value. */
function parseAttrs(src: string): Attr[] | null {
  const attrs: Attr[] = [];
  let i = 0;
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) return attrs;
    KEY.lastIndex = i;
    const key = KEY.exec(src);
    if (key === null) return null;
    i += key[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== "=") return null;
    i++;
    while (i < src.length && /\s/.test(src[i])) i++;
    const value = readValue(src, i);
    if (value === null) return null;
    attrs.push({ key: key[0], value: value.text });
    i = value.end;
  }
}

function readValue(src: string, start: number): { text: string; end: number } | null {
  const c = src[start];
  if (c === undefined) return null;
  if (c === "{") {
    const balanced = scanBalanced(src, start);
    return balanced === null ? null : { text: balanced.inner, end: balanced.end };
  }
  if (c === '"' || c === "'") {
    const quoted = scanQuoted(src, start);
    return quoted === null ? null : { text: quoted.value, end: quoted.end };
  }
  BAREWORD.lastIndex = start;
  const bareword = BAREWORD.exec(src);
  return bareword === null ? null : { text: bareword[0], end: start + bareword[0].length };
}

/** From an opening `{`: its matching closer, string-aware; returns the text between the braces. */
function scanBalanced(src: string, start: number): { inner: string; end: number } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0) return { inner: src.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** From an opening quote: its matching closer with `\\` escapes; returns the literal as written. */
function scanQuoted(src: string, start: number): { value: string; end: number } | null {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === "\\") {
      i++;
      continue;
    }
    if (src[i] === quote) return { value: src.slice(start, i + 1), end: i + 1 };
  }
  return null;
}
