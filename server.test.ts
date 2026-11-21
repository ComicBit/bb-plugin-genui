import { createFakePluginHost, makePluginAgentConfigurationContext } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { AGENT_INSTRUCTIONS, AGENT_INSTRUCTIONS_WEB_OFF, CODE_WORK_INSTRUCTIONS, UI_REFERENCE, UI_REFERENCE_MORE } from "./instructions";
import plugin from "./server";

describe("the plugin's settings", () => {
  it("lists Animations, Automatic UI instructions, and Web lookups on by default", async () => {
    const host = createFakePluginHost({ pluginId: "genui" });
    await plugin(host.bb);
    expect(host.harness.registrations.settingsDescriptors).toMatchObject({
      animations: { type: "boolean", label: "Animations", default: true },
      automaticInstructions: { type: "boolean", label: "Automatic UI instructions", default: true },
      webLookups: { type: "boolean", label: "Web lookups", default: true },
    });
    await host.harness.lifecycle.dispose();
  });
});

describe("automatic vs opt-in UI instructions", () => {
  it.each([
    [true, AGENT_INSTRUCTIONS],
    [false, AGENT_INSTRUCTIONS_WEB_OFF],
  ])("injects full UI instructions when automaticInstructions is on (webLookups=%s)", async (webLookups, expectedRules) => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "genui",
      agentSkillIds: ["ui"],
      settings: { webLookups, automaticInstructions: true },
    });
    await plugin(bb);
    const context = makePluginAgentConfigurationContext({
      thread: { id: "thr_person", parentThreadId: null },
      origin: { kind: null, pluginId: null },
    });
    const config = await harness.behavior.resolveAgentConfiguration(context);
    expect(config.tools.map((tool) => tool.name)).toEqual(["check_ui", "ui_examples"]);
    expect(config.skills).toEqual([]);
    expect(config.instructions).toBe(expectedRules);
    expect(harness.registrations.instructionProvider?.({ threadId: "thr_person", projectId: context.project.id })).toBe(
      `${UI_REFERENCE}\n\n${UI_REFERENCE_MORE}\n\n${CODE_WORK_INSTRUCTIONS}`,
    );
    for (const tool of harness.registrations.agentTools) {
      expect(tool.instructions).toBeNull();
    }
    await harness.lifecycle.dispose();
  });

  it.each([true, false])("injects no instructions and exposes /ui skill when automaticInstructions is off (webLookups=%s)", async (webLookups) => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "genui",
      agentSkillIds: ["ui"],
      settings: { webLookups, automaticInstructions: false },
    });
    await plugin(bb);
    const context = makePluginAgentConfigurationContext({
      thread: { id: "thr_optin", parentThreadId: null },
      origin: { kind: null, pluginId: null },
    });
    const config = await harness.behavior.resolveAgentConfiguration(context);
    expect(config.tools.map((tool) => tool.name)).toEqual(["check_ui", "ui_examples"]);
    expect(config.skills).toEqual(["ui"]);
    expect(config.instructions).toBeNull();
    expect(harness.registrations.instructionProvider?.({ threadId: "thr_optin", projectId: context.project.id })).toBeNull();
    for (const tool of harness.registrations.agentTools) {
      expect(tool.instructions).toBeNull();
    }
    await harness.lifecycle.dispose();
  });

  it("keeps UI tools, skills, and instructions out of background agent sessions", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "genui",
      agentSkillIds: ["ui"],
      settings: { automaticInstructions: true },
    });
    await plugin(bb);
    const context = makePluginAgentConfigurationContext({
      thread: { id: "thr_bg", parentThreadId: "parent" },
      origin: { kind: "fork", pluginId: "automations" },
    });
    const config = await harness.behavior.resolveAgentConfiguration(context);
    expect(config.tools).toEqual([]);
    expect(config.skills).toEqual([]);
    expect(config.instructions).toBeNull();
    expect(harness.registrations.instructionProvider?.({ threadId: "thr_bg", projectId: context.project.id })).toBeNull();
    await harness.lifecycle.dispose();
  });

  it("applies live changes to automaticInstructions on subsequent session resolutions", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "genui",
      agentSkillIds: ["ui"],
      settings: { automaticInstructions: true },
    });
    await plugin(bb);
    const context = makePluginAgentConfigurationContext({
      thread: { id: "thr_toggle", parentThreadId: null },
      origin: { kind: null, pluginId: null },
    });

    const before = await harness.behavior.resolveAgentConfiguration(context);
    expect(before.instructions).toBe(AGENT_INSTRUCTIONS);
    expect(before.skills).toEqual([]);
    expect(harness.registrations.instructionProvider?.({ threadId: "thr_toggle", projectId: context.project.id })).toContain(UI_REFERENCE);

    await harness.behavior.setSettings({ automaticInstructions: false });
    const afterOff = await harness.behavior.resolveAgentConfiguration(context);
    expect(afterOff.instructions).toBeNull();
    expect(afterOff.skills).toEqual(["ui"]);
    expect(harness.registrations.instructionProvider?.({ threadId: "thr_toggle", projectId: context.project.id })).toBeNull();

    await harness.behavior.setSettings({ automaticInstructions: true });
    const afterOn = await harness.behavior.resolveAgentConfiguration(context);
    expect(afterOn.instructions).toBe(AGENT_INSTRUCTIONS);
    expect(afterOn.skills).toEqual([]);
    expect(harness.registrations.instructionProvider?.({ threadId: "thr_toggle", projectId: context.project.id })).toContain(UI_REFERENCE);

    await harness.lifecycle.dispose();
  });
});
