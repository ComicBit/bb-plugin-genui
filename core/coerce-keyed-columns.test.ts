import { describe, expect, it } from "vitest";
import { compile, evaluate, initialState } from "./index";

const errors = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
const warnings = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "warning").map((d) => d.message);

function findNode(node: unknown, type: string): { props: { columns?: string[]; rows?: unknown[] } } | null {
  if (node === null || typeof node !== "object") return null;
  const record = node as { type?: string; props?: unknown; children?: unknown };
  if (record.type === type) return record as { props: { columns?: string[]; rows?: unknown[] } };
  for (const value of Object.values(record)) {
    const found = Array.isArray(value) ? value.map((item) => findNode(item, type)).find(Boolean) : findNode(value, type);
    if (found) return found;
  }
  return null;
}

describe("keyed columns and keyed cells", () => {
  it("flattens the exact reply that failed: header map + keyed cells", () => {
    const src = 'Card("t", [\n  Table(\n    {place: "№", model: "Модель", fit: "Кому подходит"},\n    [\n      [{place: 1, tone: "good"}, {model: "Claude Opus", tone: "good"}, {fit: "Основной выбор"}],\n      [{place: 2}, "XREAL", "Бюджетный вариант"],\n    ]\n  )\n])';
    const { program, diagnostics } = compile(src);
    expect(program).not.toBeNull();
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(warnings(src).some((w) => w.includes("flattened"))).toBe(true);
    const out = evaluate(program!, initialState(program!, new Map()), new Map());
    const table = findNode(JSON.parse(JSON.stringify(out.roots[0], (k, v) => (typeof v === "function" ? "ƒ" : v))), "Table");
    expect(table).not.toBeNull();
    expect(table!.props.columns).toEqual(["№", "Модель", "Кому подходит"]);
    expect(table!.props.rows).toEqual([
      [1, "Claude Opus", "Основной выбор"],
      [2, "XREAL", "Бюджетный вариант"],
    ]);
  });

  it("keeps the plain parallel-list form untouched", () => {
    expect(warnings('Table(["№"], [[1]])')).toHaveLength(0);
    expect(errors('Table(["№"], [[1]])')).toHaveLength(0);
  });

  it("keeps its errors for shapes it cannot flatten", () => {
    // A row shorter than the header map: alignment is a guess.
    expect(warnings('Table({a: "A", b: "B"}, [[1]])')).toHaveLength(0);
    expect(errors('Table({a: "A", b: "B"}, [[1]])').length).toBeGreaterThanOrEqual(1);
    // A cell keyed to nothing in the header map.
    expect(warnings('Table({a: "A"}, [[{b: 1}]])')).toHaveLength(0);
    expect(errors('Table({a: "A"}, [[{b: 1}]])').length).toBeGreaterThanOrEqual(1);
    // A header value that is not text.
    expect(warnings("Table({a: 1}, [[1]])")).toHaveLength(0);
    expect(errors("Table({a: 1}, [[1]])").length).toBeGreaterThanOrEqual(1);
    // A stray extra key inside a cell object.
    expect(warnings('Table({a: "A"}, [[{a: 1, b: 2}]])')).toHaveLength(0);
    expect(errors('Table({a: "A"}, [[{a: 1, b: 2}]])').length).toBeGreaterThanOrEqual(1);
  });
});
