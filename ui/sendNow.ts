// ⌘-click (Ctrl-click off macOS) on an answer control: the pick is staged as
// usual, then the user's whole message is sent, exactly as pressing Enter
// would. A plain click keeps the default: the pick waits in the message.
// The modifier is read once for the page, in the capture phase, so every
// answer control (Button, Decision, FollowUps, Plan, List rows) gets it
// without its own handler; the pick that follows within a moment takes it.

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** How long after the press its pick may still take the intent (a Button runs its other actions first). */
const INTENT_MS = 1000;

/** The tooltip line of an answer control that would be staged. */
export const SEND_NOW_HINT = IS_MAC ? "⌘-click to send now" : "Ctrl-click to send now";

let intentAt = Number.NEGATIVE_INFINITY;

function held(event: MouseEvent | KeyboardEvent): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey;
}

function onClick(event: MouseEvent): void {
  intentAt = held(event) ? performance.now() : Number.NEGATIVE_INFINITY;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  intentAt = held(event) ? performance.now() : Number.NEGATIVE_INFINITY;
}

if (typeof document !== "undefined") {
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

/** Whether the press behind the pick being made now held the modifier; taking it clears it. */
export function takeSendIntent(): boolean {
  const fresh = performance.now() - intentAt < INTENT_MS;
  intentAt = Number.NEGATIVE_INFINITY;
  return fresh;
}
