// Recovery for component tags an agent typed straight into markdown, outside
// any ```ui fence (ui/looseTags.ts has the recognizer). A thread-scoped scan
// finds paragraphs in assistant replies that are a single self-closing known
// component tag, hides each one, and portals a Fence with the tag rewritten
// to the spec language — the same chrome a real ```ui block gets, including
// its Source panel. A paragraph that does not parse or compile stays the raw
// text the reader already sees. Runs whether BB renders fences through the
// slot or through FenceOverlay: the slot never sees paragraphs.
import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import { compile } from "../core";
import { Fence, useThreadActions, type ThreadActions } from "./Fence";
import { looseTagSpec } from "./looseTags";

/** BB renders a markdown paragraph as `p` inside a timeline row. */
const PARAGRAPH = "[data-timeline-row-id] p";
const ROW = "[data-timeline-row-id]";
const MOUNT_ATTRIBUTE = "data-genui-loose";
const HIDDEN_ATTRIBUTE = "data-genui-hidden-tag";

interface LooseBlock {
  /** Stable while the message re-renders: `<row id>#loose#<index in that row>`. */
  key: string;
  spec: string;
  threadId: string;
  /** The assistant reply's timeline row id, which is also its BB message id. */
  messageId: string;
  /** Offset index among the message's blocks, clear of real ```ui fence indices. */
  fence: number;
  mount: HTMLElement;
}

function restore(paragraph: Element): void {
  if (paragraph instanceof HTMLElement && paragraph.hasAttribute(HIDDEN_ATTRIBUTE)) {
    paragraph.removeAttribute(HIDDEN_ATTRIBUTE);
    paragraph.style.removeProperty("display");
  }
}

/**
 * Reconciles the DOM with the previous scan: every paragraph that is one
 * well-formed component call gets a mount node right before its (hidden)
 * paragraph. Returns the previous map unchanged when nothing moved, grew, or
 * changed its spec, and whether a block appeared.
 */
function scan(
  previous: ReadonlyMap<string, LooseBlock>,
  pluginId: string,
  threadId: string,
): { blocks: ReadonlyMap<string, LooseBlock>; appeared: boolean } {
  const next = new Map<string, LooseBlock>();
  const counts = new Map<string, number>();
  let changed = false;
  let appeared = false;
  for (const paragraph of document.querySelectorAll(PARAGRAPH)) {
    // Never our own renders: Text() draws <p> inside a Fence's mount.
    if (paragraph.closest(`[${MOUNT_ATTRIBUTE}]`) !== null || paragraph.closest("[data-genui-fence]") !== null) continue;
    const row = paragraph.closest(ROW);
    const rowId = row?.getAttribute("data-timeline-row-id") ?? "";
    // Only the assistant's replies, never user messages or tool output.
    if (row === null || !rowId.startsWith(`${threadId}:`) || !rowId.includes(":assistant:")) continue;
    const tag = looseTagSpec(paragraph.textContent ?? "");
    if (tag === null) continue;
    if (compile(tag.spec).program === null) continue;
    const counter = `${rowId}#loose`;
    const index = counts.get(counter) ?? 0;
    counts.set(counter, index + 1);
    const key = `${counter}#${index}`;
    const known = previous.get(key);
    const mount = known?.mount ?? document.createElement("div");
    mount.setAttribute(MOUNT_ATTRIBUTE, "");
    mount.setAttribute("data-genui-renderer", "overlay");
    // BB scopes plugin CSS to `[data-bb-plugin=<id>]` subtrees; a portal into
    // BB's own DOM is outside every plugin root unless it declares one.
    mount.setAttribute("data-bb-plugin", pluginId);
    if (paragraph.previousElementSibling !== mount) paragraph.before(mount);
    if (paragraph instanceof HTMLElement && !paragraph.hasAttribute(HIDDEN_ATTRIBUTE)) {
      paragraph.setAttribute(HIDDEN_ATTRIBUTE, "");
      paragraph.style.display = "none";
    }
    if (known === undefined) appeared = true;
    if (known === undefined || known.spec !== tag.spec) changed = true;
    next.set(key, {
      key,
      spec: tag.spec,
      threadId: rowId.slice(0, rowId.indexOf(":")),
      messageId: rowId,
      // Real fences number 0..n among the message's ```ui blocks; the offset
      // keeps an answer staged here separate from any of them.
      fence: 1000 + index,
      mount,
    });
  }
  for (const [key, block] of previous) {
    if (next.has(key)) continue;
    changed = true;
    block.mount.remove();
  }
  return { blocks: changed ? next : previous, appeared };
}

export function LooseTagsOverlay({ threadId }: { threadId: string }) {
  const [blocks, setBlocks] = useState<ReadonlyMap<string, LooseBlock>>(() => new Map());
  const actions = useThreadActions();
  const pluginId = experimental_usePluginId();

  useEffect(() => {
    let current: ReadonlyMap<string, LooseBlock> = new Map();
    let timer: number | undefined;
    const commit = (blocks: ReadonlyMap<string, LooseBlock>) => {
      clearTimeout(timer);
      timer = undefined;
      current = blocks;
      flushSync(() => setBlocks(blocks));
    };
    const run = () => {
      const { blocks, appeared } = scan(current, pluginId, threadId);
      if (blocks === current) return;
      if (appeared) commit(blocks);
      else timer ??= window.setTimeout(() => commit(scan(current, pluginId, threadId).blocks), 60);
    };
    const observer = new MutationObserver((records) => {
      // Our own renders mutate the page too; they never add or change a paragraph.
      const foreign = records.some((record) => {
        const node = record.target instanceof Element ? record.target : record.target.parentElement;
        return node?.closest(`[${MOUNT_ATTRIBUTE}]`) == null;
      });
      if (foreign) run();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    run();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      for (const block of current.values()) block.mount.remove();
      for (const paragraph of document.querySelectorAll(`[${HIDDEN_ATTRIBUTE}]`)) {
        const rowId = paragraph.closest(ROW)?.getAttribute("data-timeline-row-id");
        if (rowId?.startsWith(`${threadId}:`)) restore(paragraph);
      }
    };
  }, [pluginId, threadId]);

  return [...blocks.values()].map((block) =>
    createPortal(
      <Fence
        language="ui"
        code={block.spec}
        complete
        stateKey={`bb.genui.state:${block.key}`}
        threadId={block.threadId}
        messageId={block.messageId}
        fence={block.fence}
        actions={actions}
      />,
      block.mount,
      block.key,
    ),
  );
}
