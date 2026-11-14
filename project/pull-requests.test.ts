import { describe, expect, it } from "vitest";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createPullRequestReader, PULL_REQUEST_BATCH, PULL_REQUEST_PLUGIN, pullRequestRow } from "./pull-requests";
import { createProjectSource } from "./source";

type Sdk = BbPluginApi["sdk"];

const PULL_REQUEST = {
  number: 7,
  title: "Read pull requests over RPC",
  url: "https://github.com/acme/app/pull/7",
  state: "open",
  baseRefName: "main",
  headRefName: "feat",
  checks: { state: "passing", passedCount: 2, failedCount: 0, pendingCount: 0, totalCount: 2 },
  review: { state: "approved", reviewRequestCount: 0 },
  mergeability: { state: "mergeable", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" },
  attention: "ready_to_merge",
  autoMerge: false,
  inMergeQueue: null,
  updatedAt: "2026-11-14T10:00:00Z",
};

const AVAILABLE = { outcome: "available", pullRequest: PULL_REQUEST };

/** A BB 0.49 whose bb--github-pr-status answers each environment with `row` (or fails); older BB passes `legacy`. */
function fakeBb(row: ((environmentId: string) => unknown) | Error, legacy?: () => Promise<unknown>) {
  const calls: { pluginId: string; method: string; input: { keys: string[] } }[] = [];
  const sdk = {
    environments: legacy === undefined ? {} : { pullRequest: legacy },
    plugins: {
      callRpc: async ({ outputSchema, ...args }: (typeof calls)[number] & { outputSchema: { parse(value: unknown): unknown } }) => {
        calls.push(args);
        if (row instanceof Error) throw row;
        // Like BB: an environment with no row is left out, and the answer goes through the caller's schema.
        const rows = args.input.keys.map((key) => [key, row(key)] as const).filter(([, value]) => value !== undefined);
        return outputSchema.parse(Object.fromEntries(rows));
      },
    },
  };
  return { sdk: sdk as unknown as Sdk, calls };
}

function rows(byEnvironment: Record<string, unknown>) {
  return (environmentId: string) => byEnvironment[environmentId];
}

describe("pull requests: reading", () => {
  it("asks bb--github-pr-status for the environment's row", async () => {
    const { sdk, calls } = fakeBb(rows({ env_a: AVAILABLE }));
    const answer = await createPullRequestReader(sdk).read("env_a");
    expect(calls).toEqual([{ pluginId: PULL_REQUEST_PLUGIN, method: "pullRequests", input: { keys: ["env_a"] } }]);
    expect(answer).toMatchObject({ outcome: "available", pullRequest: { number: 7, state: "open" } });
  });

  it("passes on absent and unavailable rows, and takes a missing row for no pull request", async () => {
    const { sdk } = fakeBb(rows({ env_a: { outcome: "absent" }, env_b: { outcome: "unavailable", message: "Machine offline" } }));
    const reader = createPullRequestReader(sdk);
    expect(await reader.read("env_a")).toEqual({ outcome: "absent" });
    expect(await reader.read("env_b")).toEqual({ outcome: "unavailable", message: "Machine offline" });
    expect(await reader.read("env_c")).toEqual({ outcome: "absent" });
  });

  it("says the PR plugin didn't answer when the call fails", async () => {
    const answer = await createPullRequestReader(fakeBb(new Error("plugin bb--github-pr-status is disabled")).sdk).read("env_a");
    expect(answer).toEqual({
      outcome: "unavailable",
      message: "The GitHub PR Status plugin (bb--github-pr-status) didn't answer: plugin bb--github-pr-status is disabled",
    });
  });

  it("asks sdk.environments.pullRequest on a BB that still has it, and not the plugin", async () => {
    const { sdk, calls } = fakeBb(rows({}), async () => AVAILABLE);
    expect(await createPullRequestReader(sdk).read("env_a")).toMatchObject({ outcome: "available", pullRequest: { number: 7 } });
    expect(calls).toEqual([]);
  });

  it("says why when BB has neither way to read a pull request", async () => {
    const bare = { environments: {} } as unknown as Sdk;
    expect(await createPullRequestReader(bare).read("env_a")).toEqual({ outcome: "unavailable", message: "This version of BB can't read pull requests" });
  });
});

describe("pull requests: checking a row", () => {
  it("names the first field genui can't show", () => {
    const { checks: _, ...withoutChecks } = PULL_REQUEST;
    expect(pullRequestRow({ outcome: "available", pullRequest: withoutChecks })).toEqual({
      outcome: "unavailable",
      message: "The GitHub PR Status plugin sent a pull request genui can't show (checks)",
    });
    expect(pullRequestRow({ outcome: "available", pullRequest: { ...PULL_REQUEST, checks: { ...PULL_REQUEST.checks, failedCount: -1 } } })).toMatchObject({
      message: expect.stringContaining("(checks.failedCount)"),
    });
  });

  it("refuses a value genui has no words for", () => {
    expect(pullRequestRow({ outcome: "available", pullRequest: { ...PULL_REQUEST, attention: "on_fire" } })).toMatchObject({
      outcome: "unavailable",
      message: expect.stringContaining("(attention)"),
    });
  });

  it("refuses an answer that isn't a row at all", () => {
    expect(pullRequestRow("absent")).toEqual({ outcome: "unavailable", message: "The GitHub PR Status plugin sent an answer genui can't read" });
  });

  it("checks rows one by one: one it can't show doesn't hide the others", async () => {
    const { sdk, calls } = fakeBb(rows({ env_a: AVAILABLE, env_b: { outcome: "available", pullRequest: { number: 8 } } }));
    const reader = createPullRequestReader(sdk);
    const [a, b] = await Promise.all([reader.read("env_a"), reader.read("env_b")]);
    expect(calls).toHaveLength(1);
    expect(a).toMatchObject({ outcome: "available", pullRequest: { number: 7 } });
    expect(b).toMatchObject({ outcome: "unavailable" });
  });
});

describe("pull requests: batching", () => {
  it("sends reads that come together as one call, asking once for an environment read twice", async () => {
    const { sdk, calls } = fakeBb(() => ({ outcome: "absent" }));
    const reader = createPullRequestReader(sdk);
    await Promise.all(["env_a", "env_b", "env_a", "env_c"].map((id) => reader.read(id)));
    expect(calls.map((call) => call.input.keys)).toEqual([["env_a", "env_b", "env_c"]]);
    // A read after that call is a call of its own.
    await reader.read("env_a");
    expect(calls).toHaveLength(2);
  });

  it(`splits more than ${PULL_REQUEST_BATCH} environments into calls the plugin takes`, async () => {
    const { sdk, calls } = fakeBb(() => ({ outcome: "absent" }));
    const reader = createPullRequestReader(sdk);
    const ids = Array.from({ length: PULL_REQUEST_BATCH + 5 }, (_, index) => `env_${index}`);
    const answers = await Promise.all(ids.map((id) => reader.read(id)));
    expect(calls.map((call) => call.input.keys.length)).toEqual([PULL_REQUEST_BATCH, 5]);
    expect(answers.every((answer) => answer.outcome === "absent")).toBe(true);
  });
});

describe("pull requests: PullRequest", () => {
  function source(row: (environmentId: string) => unknown, environment: Record<string, unknown> = { branchName: "feat" }) {
    const { sdk } = fakeBb(row);
    const bb = {
      sdk: {
        ...sdk,
        threads: { get: async () => ({ id: "thr_mine00", projectId: "proj_a", environmentId: "env_a", deletedAt: null }) },
        environments: { get: async () => environment },
      },
    };
    return createProjectSource(bb as unknown as BbPluginApi, { get: async () => undefined, set: async () => {} });
  }

  it("shows the branch's pull request on a BB without sdk.environments.pullRequest", async () => {
    const answer = await source(rows({ env_a: AVAILABLE })).pullRequest("thr_mine00");
    expect(answer).toMatchObject({ ok: true, branch: "feat", pullRequest: { number: 7, checks: { state: "passing", passed: 2 } } });
  });

  it("shows no pull request, not an error, for a workspace that isn't a git repository", async () => {
    const answer = await source(rows({ env_a: { outcome: "absent" } }), { branchName: null, isGitRepo: false }).pullRequest("thr_mine00");
    expect(answer).toMatchObject({ ok: true, branch: null, pullRequest: null });
  });
});
