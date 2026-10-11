// Pure rules behind useSuperseded: whether a reply has been answered, and
// which thread changes can change that. No React, no DOM, no SDK.

/** One message of BB's conversation outline (`sdk.threads.conversationOutline`), in thread order. */
export interface OutlineItem {
  readonly id: string;
  readonly role: "assistant" | "user";
}

/**
 * Whether a user message follows the message `anchorId` (the assistant reply
 * holding a block). Null when the anchor is not in the outline, so the
 * caller can keep what it knew: a nested agent's message, or a reply the
 * outline no longer lists.
 */
export function hasLaterUserMessage(items: readonly OutlineItem[] | null, anchorId: string): boolean | null {
  if (items === null) return null;
  const anchor = items.findIndex((item) => item.id === anchorId);
  if (anchor === -1) return null;
  for (let index = anchor + 1; index < items.length; index += 1) {
    if (items[index]?.role === "user") return true;
  }
  return false;
}

/** The part of BB's `thread:changed` realtime event this module reads. */
export interface ThreadChange {
  readonly changes: readonly string[];
  readonly metadata?: { readonly eventTypes?: readonly string[] };
}

/**
 * Thread events that add, accept, reject or drop a user message. Every user
 * message (typed, sent by a plugin or the CLI, dispatched from the queue)
 * enters as `client/turn/requested`; the rest cover steering, manager
 * messages and context resets.
 */
const CONVERSATION_EVENTS: Readonly<Record<string, true>> = {
  "client/thread/start": true,
  "client/turn/requested": true,
  "client/turn/rejected": true,
  "client/turn/start": true,
  "turn/input/accepted": true,
  "turn/started": true,
  "system/manager/user_message": true,
  "thread/context/cleared": true,
  "thread/compacted": true,
};

/**
 * Whether a change can move a user message in or out of the outline, so it
 * must be read again. Streaming deltas and tool progress never can, which
 * keeps a running reply from refetching on every token.
 */
export function affectsConversation(change: ThreadChange): boolean {
  return change.changes.some((kind) => {
    if (kind === "history-rewritten" || kind === "history-compacted") return true;
    if (kind !== "events-appended") return false;
    const types = change.metadata?.eventTypes;
    // An append that doesn't say what it appended may be anything.
    return types === undefined || types.some((type) => Object.hasOwn(CONVERSATION_EVENTS, type));
  });
}
