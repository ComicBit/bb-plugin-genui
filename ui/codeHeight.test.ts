import { describe, expect, it, vi } from "vitest";
import { CodeHeights } from "./codeHeight";

describe("CodeHeights", () => {
  it("predicts nothing until it has seen two lengths of code", () => {
    const store = new CodeHeights();
    expect(store.predict(5, 384)).toBeNull();
    store.record(2, 68);
    expect(store.predict(2, 384)).toBe(68);
    expect(store.predict(5, 384)).toBeNull();
  });

  it("reads the body's cap only when it can predict a height", () => {
    const store = new CodeHeights();
    const cap = vi.fn(() => 384);
    expect(store.predict(5, cap)).toBeNull();
    store.record(3, 86);
    expect(store.predict(5, cap)).toBeNull();
    expect(cap).not.toHaveBeenCalled();

    expect(store.predict(3, cap)).toBe(86);
    expect(cap).toHaveBeenCalledTimes(1);
    store.record(5, 122);
    expect(store.predict(4, cap)).toBe(104);
    expect(cap).toHaveBeenCalledTimes(2);
  });

  it("uses the current cap for old stored heights and capped interpolation samples", () => {
    const store = CodeHeights.read(JSON.stringify([[1, 50], [2, 68], [25, 384]]));
    expect(store.recordedHeight(25)).toBe(384);
    expect(store.recordedHeight(4)).toBeNull();
    let maximum = 384;
    const cap = () => maximum;
    expect(store.predict(4, cap)).toBe(104);
    expect(store.predict(25, cap)).toBe(384);

    maximum = 96;
    expect(store.predict(4, cap)).toBe(96);
    expect(store.predict(25, cap)).toBe(96);
  });

  it("puts unseen lengths on the line through the nearest lengths it has seen, up to the body's cap", () => {
    const store = new CodeHeights();
    store.record(1, 50);
    store.record(2, 68);
    expect(store.predict(10, 384)).toBe(212);
    expect(store.predict(19, 384)).toBe(374);
    expect(store.predict(30, 384)).toBe(384);
  });

  it("leaves capped heights out of the line, and follows the viewer when it draws a length differently", () => {
    const store = new CodeHeights();
    store.record(1, 50);
    store.record(25, 384);
    expect(store.predict(4, 384)).toBeNull();
    store.record(2, 68);
    expect(store.predict(4, 384)).toBe(104);
    store.record(2, 72);
    expect(store.predict(2, 384)).toBe(72);
  });

  it("round-trips through storage and skips what a damaged copy holds", () => {
    const store = new CodeHeights();
    store.record(1, 50);
    store.record(2, 68);
    expect(CodeHeights.read(store.serialize()).predict(3, 384)).toBe(86);
    const mixed = CodeHeights.read(JSON.stringify([[1, 50], [2, -4], ["3", 86], [4, "tall"], [0, 30]]));
    expect([mixed.predict(1, 384), mixed.predict(2, 384)]).toEqual([50, null]);
    expect(CodeHeights.read("{not json").predict(1, 384)).toBeNull();
  });
});

