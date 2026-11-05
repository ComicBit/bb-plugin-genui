import { describe, expect, it } from "vitest";
import { compile } from "../core";
import { looseTagSpec } from "./looseTags";

describe("loose component tags", () => {
  it("rewrites the classic trailing Sources tag into a spec statement", () => {
    expect(
      looseTagSpec('<Sources links={[{url: "https://www.viture.com/beast", title: "VITURE Beast: 1200/глаз, 120 Гц"}]} />'),
    ).toEqual({
      name: "Sources",
      spec: 'Sources(links: [{url: "https://www.viture.com/beast", title: "VITURE Beast: 1200/глаз, 120 Гц"}])',
    });
  });

  it("produces specs that compile", () => {
    const tag = looseTagSpec('<Sources links={[{url: "https://a.example/x", title: "A"}, {url: "https://b.example/y"}]} />');
    expect(tag).not.toBeNull();
    const result = compile(tag!.spec);
    expect(result.program).not.toBeNull();
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("strips JSX braces, keeps quoted strings, and reads several attributes", () => {
    expect(looseTagSpec('<Metric label="Uplink" value={42} tone="good" />')).toEqual({
      name: "Metric",
      spec: 'Metric(label: "Uplink", value: 42, tone: "good")',
    });
    expect(looseTagSpec("<Badge text={'live'} />")).toEqual({ name: "Badge", spec: "Badge(text: 'live')" });
  });

  it("handles braces, brackets and quotes nested in a value", () => {
    const tag = looseTagSpec('<Table columns={[{key: "n", label: "N"}]} rows={[["a]b", "c}d"]]} />');
    expect(tag).toEqual({
      name: "Table",
      spec: 'Table(columns: [{key: "n", label: "N"}], rows: [["a]b", "c}d"]])',
    });
    expect(compile(tag!.spec).program).not.toBeNull();
  });

  it("reads attributes spread over several lines", () => {
    expect(looseTagSpec('<Metric\n  label="Uplink"\n  value={7}\n/>')).toEqual({
      name: "Metric",
      spec: 'Metric(label: "Uplink", value: 7)',
    });
  });

  it("keeps the attributeless form", () => {
    expect(looseTagSpec("<Divider />")).toEqual({ name: "Divider", spec: "Divider()" });
  });

  it("rejects paired tags with children", () => {
    expect(looseTagSpec('<Card title="x">children</Card>')).toBeNull();
  });

  it("rejects names outside the catalog and lowercase tags", () => {
    expect(looseTagSpec('<Widget links={[]} />')).toBeNull();
    expect(looseTagSpec("<sources links={[]} />")).toBeNull();
  });

  it("rejects prose around the tag and several tags in one paragraph", () => {
    expect(looseTagSpec('See <Sources links={[]} /> below')).toBeNull();
    expect(looseTagSpec('<Sources links={[]} /><Sources links={[]} />')).toBeNull();
  });

  it("rejects an attribute that never closes", () => {
    expect(looseTagSpec("<Sources links={[{url: \"open\"} />")).toBeNull();
  });

  it("rejects ordinary text", () => {
    expect(looseTagSpec("Просто текст с < углом и слэшем />")).toBeNull();
    expect(looseTagSpec("")).toBeNull();
  });
});
