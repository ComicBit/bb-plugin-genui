import type { PluginAgentConfigurationContext } from "@get-bb/plugin-sdk";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "./server";

/** The fields configure reads: a top-level thread the user started. */
const personThread = {
  pluginMetadata: {},
  thread: { id: "thread-1", title: null, parentThreadId: null, sourceThreadId: null },
  origin: { pluginId: null },
} as unknown as PluginAgentConfigurationContext;

async function loaded(settings?: Record<string, string>) {
  const host = createFakePluginHost({ pluginId: "genui", settings });
  await plugin(host.bb);
  const { agentConfigurationProvider, instructionProvider } = host.harness.registrations;
  agentConfigurationProvider!(personThread);
  const codeWork = () => instructionProvider!({ threadId: "thread-1", projectId: "project-1" });
  const examples = async (component: string) => {
    const result = await host.harness.callAgentTool("ui_examples", { components: [component] });
    return typeof result === "string" ? result : result.content.map((part) => (part.type === "text" ? part.text : "")).join("");
  };
  return { host, codeWork, examples };
}

describe("the plugin's settings", () => {
  it("lists Animations, on by default, beside Web lookups", async () => {
    const host = createFakePluginHost({ pluginId: "genui" });
    await plugin(host.bb);
    expect(host.harness.registrations.settingsDescriptors).toMatchObject({
      animations: { type: "boolean", label: "Animations", default: true },
      webLookups: { type: "boolean", label: "Web lookups", default: true },
      pullRequestCli: { type: "string", label: "Pull request CLI", default: "gh" },
    });
  });
});

describe("the Pull request CLI setting", () => {
  it("tells agents the gh commands by default", async () => {
    const { codeWork, examples } = await loaded();
    expect(codeWork()).not.toContain(" pr checks");
    expect(await examples("Board")).toContain("gh pr list --json");
    expect(await examples("Pipeline")).toContain("gh pr checks <n> --json");
  });

  it("tells agents the other CLI's commands once set to it", async () => {
    const { host, codeWork, examples } = await loaded();
    await host.harness.setSettings({ pullRequestCli: "acme-pr" });
    expect(codeWork()).toContain("acme-pr pr checks <n> --json");
    expect(codeWork()).toContain("acme-pr pr list --json");
    expect(await examples("Board")).toContain("acme-pr pr list --json");
    expect(await examples("Board")).not.toContain("gh pr list --json");
    expect(await examples("Pipeline")).not.toContain("gh pr checks <n>");
  });

  it("refuses a value that isn't a bare command name", async () => {
    const { host, codeWork } = await loaded();
    await expect(host.harness.setSettings({ pullRequestCli: "acme-pr; rm -rf ~" })).rejects.toThrow();
    expect(codeWork()).not.toContain("rm -rf");
  });

  it("falls back to gh for an empty value", async () => {
    const { codeWork, examples } = await loaded({ pullRequestCli: "" });
    await Promise.resolve();
    expect(codeWork()).not.toContain(" pr checks");
    expect(await examples("Board")).toContain("gh pr list --json");
  });

  it("reads a value saved before the plugin loaded", async () => {
    const { codeWork } = await loaded({ pullRequestCli: "acme-pr" });
    await Promise.resolve();
    expect(codeWork()).toContain("acme-pr pr list --json");
  });
});
