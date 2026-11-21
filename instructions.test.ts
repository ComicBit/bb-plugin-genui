import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIONS, COMPONENTS } from "./core/catalog";
import { collectLoads, compile, dataKey, evaluate, formatDiagnostics, initialState, type LoadedData } from "./core";
import {
  AGENT_INSTRUCTIONS,
  AGENT_INSTRUCTIONS_WEB_OFF,
  CODE_WORK_INSTRUCTIONS,
  UI_REFERENCE,
  UI_REFERENCE_MORE,
  WEB_LOOKUPS_OFF,
} from "./instructions";

describe("agent instructions", () => {
  it("keeps the opt-in /ui skill in sync with instructions.ts", () => {
    const skill = readFileSync(new URL("./skills/ui/SKILL.md", import.meta.url), "utf8");
    expect(skill).toMatch(/^---\nname: ui\ndescription: Use only when/);
    expect(skill).toContain(`${UI_REFERENCE}\n\n${UI_REFERENCE_MORE}\n\n${CODE_WORK_INSTRUCTIONS}\n\n${AGENT_INSTRUCTIONS}\n`);
    expect(skill).toContain("bb plugin config genui");
  });

  // Keep each section bounded (<= 4096 chars) and the combined reference
  // contributed in server.ts well within BB's 32768-character cap.
  it("fit BB's instruction caps", () => {
    expect(AGENT_INSTRUCTIONS.length).toBeLessThanOrEqual(4096);
    expect(AGENT_INSTRUCTIONS_WEB_OFF.length).toBeLessThanOrEqual(4096);
    expect(CODE_WORK_INSTRUCTIONS.length).toBeLessThanOrEqual(4096);
    expect(UI_REFERENCE.length).toBeLessThanOrEqual(4096);
    expect(UI_REFERENCE_MORE.length).toBeLessThanOrEqual(4096);
    expect(`${UI_REFERENCE}\n\n${UI_REFERENCE_MORE}\n\n${CODE_WORK_INSTRUCTIONS}`.length).toBeLessThanOrEqual(32768);
  });

  // A replace that silently matches nothing would keep teaching Map while lookups are off.
  it("swap the Map example for the off note while web lookups are off", () => {
    expect(AGENT_INSTRUCTIONS_WEB_OFF).toContain(WEB_LOOKUPS_OFF);
    expect(AGENT_INSTRUCTIONS_WEB_OFF).not.toContain("Map(");
  });

  // The Evidence group's signatures ride on the code-work section, which every session that gets the references also gets.
  it("list every component and action the parser accepts", () => {
    const reference = `${UI_REFERENCE}\n${UI_REFERENCE_MORE}\n${CODE_WORK_INSTRUCTIONS}`;
    for (const name of [...Object.keys(COMPONENTS), ...Object.keys(ACTIONS)]) {
      expect(reference, name).toContain(`${name}(`);
    }
  });

  it("carry examples that compile and render without errors", () => {
    const examples = [...`${AGENT_INSTRUCTIONS}\n${CODE_WORK_INSTRUCTIONS}`.matchAll(/```ui\n([\s\S]*?)\n```/g)].map((match) => match[1]);
    expect(examples.length).toBeGreaterThan(3);
    for (const example of examples) {
      const compiled = compile(example);
      expect(formatDiagnostics(compiled.diagnostics), example).toBe("");
      const program = compiled.program!;
      // Example paths are illustrative: each Load reads as an empty report.
      const data = new Map<string, LoadedData>(collectLoads(program).map((request) => [dataKey(request), { ok: true, value: [] }]));
      const { diagnostics } = evaluate(program, initialState(program, data), data);
      expect(diagnostics, example).toEqual([]);
    }
  });
});
