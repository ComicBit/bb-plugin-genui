import { describe, expect, it } from "vitest";
import { compile, initialState } from "./index";

const errors = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
const warnings = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "warning").map((d) => d.message);

describe("a heading typed into Board's columns", () => {
  it("moves the string to label with a warning", () => {
    const src = 'Card("t", [Board([{title: "a", status: "done"}], "Моя доска")])';
    const { program, diagnostics } = compile(src);
    expect(program).not.toBeNull();
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(warnings(src).some((w) => w.includes("`label`"))).toBe(true);
    expect(initialState(program!)).toMatchObject({});
  });

  it("leaves real column lists and explicit labels alone", () => {
    expect(warnings('Board([{title: "a", status: "done"}], ["todo", "done"])')).toHaveLength(0);
    expect(warnings('Board([{title: "a", status: "done"}], ["todo"], "Моя доска")')).toHaveLength(0);
    expect(errors('Board([{title: "a", status: "done"}], ["todo"], "Моя доска")')).toHaveLength(0);
  });
});

describe("Button(detail: …) points at the option components", () => {
  it("the unknown-parameter error suggests OptionCards", () => {
    const msgs = errors('Button("A", detail: "Описание")');
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain("OptionCards");
  });
});
