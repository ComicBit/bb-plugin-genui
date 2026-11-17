import { describe, expect, it } from "vitest";
import { affectsConversation, hasLaterUserMessage, isAutomatedPreview, type OutlineItem } from "./supersession";

// Ids as BB's conversation outline and timeline rows write them.
const ASK = "thr_a:assistant:kind:assistant|turn:t12|parent:root|item:i20";
const LATEST = "thr_a:assistant:kind:assistant|turn:t20|parent:root|item:i38";
const OUTLINE: readonly OutlineItem[] = [
  { id: "thr_a:user-seed:1", role: "user" },
  { id: ASK, role: "assistant" },
  { id: "thr_a:user-seed:40", role: "user" },
  { id: LATEST, role: "assistant" },
];

describe("hasLaterUserMessage", () => {
  it("is true for a reply the user has answered since", () => {
    expect(hasLaterUserMessage(OUTLINE, ASK)).toBe(true);
  });

  it("is false while the reply is the latest exchange", () => {
    expect(hasLaterUserMessage(OUTLINE, LATEST)).toBe(false);
  });

  it("ignores later assistant messages of the same turn", () => {
    const outline: OutlineItem[] = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "a2", role: "assistant" },
    ];
    expect(hasLaterUserMessage(outline, "a1")).toBe(false);
  });

  it("does not count user messages before the reply", () => {
    expect(hasLaterUserMessage([{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }], "a1")).toBe(false);
  });

  it("ignores a user row listed out of sequence, like BB's rejected steer at the end", () => {
    const stale: OutlineItem = { id: "thr_a:user-seed:30", role: "user" };
    expect(hasLaterUserMessage([...OUTLINE, stale], LATEST)).toBe(false);
    expect(hasLaterUserMessage([...OUTLINE, stale, { id: "thr_a:user-seed:50", role: "user" }], LATEST)).toBe(true);
  });

  it("keeps the question open after messages BB injected, like a subthread finishing", () => {
    const notice: OutlineItem = { id: "thr_a:user-seed:45", role: "user", automated: true };
    const agent: OutlineItem = { id: "thr_a:user-seed:46", role: "user", automated: true };
    const reply: OutlineItem = { id: "thr_a:assistant:kind:assistant|turn:t22|parent:root|item:i50", role: "assistant" };
    expect(hasLaterUserMessage([...OUTLINE, notice, reply, agent], LATEST)).toBe(false);
    expect(hasLaterUserMessage([...OUTLINE, notice, reply, { id: "thr_a:user-seed:60", role: "user" }], LATEST)).toBe(true);
  });

  it("still skips an out-of-sequence row listed after an injected message", () => {
    const notice: OutlineItem = { id: "thr_a:user-seed:45", role: "user", automated: true };
    expect(hasLaterUserMessage([...OUTLINE, notice, { id: "thr_a:user-seed:30", role: "user" }], LATEST)).toBe(false);
  });

  it("is unknown when the outline is not loaded or lacks the reply", () => {
    expect(hasLaterUserMessage(null, ASK)).toBeNull();
    expect(hasLaterUserMessage(OUTLINE, "thr_a:assistant:nested")).toBeNull();
  });
});

describe("affectsConversation", () => {
  const appended = (...eventTypes: string[]) => ({ changes: ["events-appended"], metadata: { eventTypes } });

  it("re-reads when a user message is requested or accepted", () => {
    expect(affectsConversation(appended("client/turn/requested"))).toBe(true);
    expect(affectsConversation(appended("item/agentMessage/delta", "turn/input/accepted"))).toBe(true);
  });

  it("skips streaming and tool progress", () => {
    expect(affectsConversation(appended("item/agentMessage/delta"))).toBe(false);
    expect(affectsConversation(appended("item/started", "item/completed", "thread/tokenUsage/updated"))).toBe(false);
  });

  it("re-reads appends of unknown events and rewritten history", () => {
    expect(affectsConversation({ changes: ["events-appended"] })).toBe(true);
    expect(affectsConversation({ changes: ["history-rewritten"] })).toBe(true);
  });

  it("skips changes that leave the messages alone", () => {
    expect(affectsConversation({ changes: ["status-changed", "title-changed", "read-state-changed"] })).toBe(false);
  });
});

describe("isAutomatedPreview", () => {
  it("recognises BB's system notices and agent messages", () => {
    expect(isAutomatedPreview("[bb system] @thread:thr_child42 completed: Nothing more to do here")).toBe(true);
    expect(isAutomatedPreview("[bb system] bb restarted while you were running `pnpm test`.")).toBe(true);
    expect(isAutomatedPreview("[bb message from thread:thr_abc123] The draft is ready")).toBe(true);
    expect(isAutomatedPreview("[bb message from thread:thr_abc123;reply=x] Done")).toBe(true);
  });

  it("leaves the person's own messages alone", () => {
    expect(isAutomatedPreview("Reply to the vendor: send option (a)")).toBe(false);
    expect(isAutomatedPreview("Why did [bb system] show up here?")).toBe(false);
    expect(isAutomatedPreview("[Board] Run this task with an agent")).toBe(false);
    expect(isAutomatedPreview("")).toBe(false);
    expect(isAutomatedPreview(undefined)).toBe(false);
  });
});
