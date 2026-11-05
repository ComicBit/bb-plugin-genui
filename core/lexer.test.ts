import { describe, expect, it } from "vitest";
import { DiagnosticList } from "./diagnostics";
import { tokenize } from "./lexer";

/** Tokenizes one source string and summarizes its first string token plus diagnostics. */
function str(src: string): { value: string | undefined; errors: number; warnings: number } {
  const diagnostics = new DiagnosticList();
  const tokens = tokenize(src, diagnostics);
  const token = tokens.find((t) => t.t === "str");
  return {
    value: token?.t === "str" ? token.value : undefined,
    errors: diagnostics.items.filter((d) => d.severity === "error").length,
    warnings: diagnostics.items.filter((d) => d.severity === "warning").length,
  };
}

function tpl(src: string): { quasis: string[]; errors: number; warnings: number } {
  const diagnostics = new DiagnosticList();
  const tokens = tokenize(src, diagnostics);
  const token = tokens[0];
  return {
    quasis: token?.t === "tpl" ? [...token.quasis] : [],
    errors: diagnostics.items.filter((d) => d.severity === "error").length,
    warnings: diagnostics.items.filter((d) => d.severity === "warning").length,
  };
}

describe("lexer escapes", () => {
  it("decodes the documented escapes", () => {
    expect(str('"a\\n\\t\\\\\\"b"')).toEqual({ value: 'a\n\t\\"b', errors: 0, warnings: 0 });
  });

  it("keeps unknown escapes as literal text with a warning, so Windows paths survive", () => {
    expect(str('"D:\\Science"')).toEqual({ value: "D:\\Science", errors: 0, warnings: 1 });
    expect(str('"D:\\Share\\docs"')).toEqual({ value: "D:\\Share\\docs", errors: 0, warnings: 2 });
  });

  it("keeps regex and LaTeX backslashes in templates", () => {
    expect(tpl("`\\S+ matches, \\Delta`")).toEqual({
      quasis: ["\\S+ matches, \\Delta"],
      errors: 0,
      warnings: 2,
    });
  });

  it("still decodes \\u{hex} and \\uXXXX", () => {
    expect(str('"\\u{1F600}"')).toEqual({ value: "\u{1F600}", errors: 0, warnings: 0 });
    expect(str('"\\u0041"')).toEqual({ value: "A", errors: 0, warnings: 0 });
  });

  it("keeps an invalid \\u escape as literal text with a warning", () => {
    expect(str('"\\u{ZZ}"')).toEqual({ value: "\\u{ZZ}", errors: 0, warnings: 1 });
  });

  it("escapes a closing backtick like JavaScript instead of ending the template", () => {
    expect(tpl("`a\\`b`")).toEqual({ quasis: ["a`b"], errors: 0, warnings: 0 });
  });

  it("still reports an unterminated string when an escaped quote swallows the closer", () => {
    expect(str('"abc\\"').errors).toBeGreaterThanOrEqual(1);
  });

  it("still reports an unterminated string after a backslash before a newline", () => {
    expect(str('"abc\\\ndef"').errors).toBeGreaterThanOrEqual(1);
  });

  it("keeps \\$ from starting an interpolation in a template", () => {
    const diagnostics = new DiagnosticList();
    const tokens = tokenize("`a\\${b}`", diagnostics);
    expect(tokens[0]).toMatchObject({ t: "tpl", quasis: ["a${b}"], parts: [] });
    expect(diagnostics.items.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("compiles a spec with a Windows path without errors", async () => {
    const { compile } = await import("./index");
    const result = compile('Text("D:\\Science\\report.md")');
    expect(result.program).not.toBeNull();
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });
});
