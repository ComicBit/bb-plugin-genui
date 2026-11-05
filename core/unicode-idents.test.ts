import { describe, expect, it } from "vitest";
import { compile, initialState } from "./index";

const errors = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
const warnings = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "warning").map((d) => d.message);

describe("unicode identifiers", () => {
  it("allows Cyrillic state names", () => {
    const src = '$имя = "привет"\n$счёт = 3\nCard($имя, [Text($имя), Metric("Счёт", $счёт)])';
    const { program, diagnostics } = compile(src);
    expect(program).not.toBeNull();
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(initialState(program!)).toMatchObject({ имя: "привет", счёт: 3 });
  });

  it("allows Cyrillic named values and functions", () => {
    const src = 'сумма = (a, b) => a + b\nText(сумма(1, 2))';
    const { program, diagnostics } = compile(src);
    expect(program).not.toBeNull();
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("keeps ASCII identifiers and the digit rule working", () => {
    expect(errors('$x2 = 1\nText($x2)')).toHaveLength(0);
    // A number cannot start an identifier: still rejected.
    expect(errors('2x = 1').some((message) => message.includes("invalid number"))).toBe(true);
  });
});

describe("a space inside a state name", () => {
  it("explains the space-in-name mistake in the parse error", () => {
    const src = '$п areas = [\n  ["Группы", "пол"]\n]';
    const msgs = compile(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs.some((m) => m.includes("cannot contain spaces") && m.includes("$пareas"))).toBe(true);
  });
});
