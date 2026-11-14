// readPullRequest: BB serves an environment's pull request from the
// bb--github-pr-status plugin's pullRequests RPC; older BB had
// sdk.environments.pullRequest instead.
import { describe, expect, it } from "vitest";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createProjectSource, PULL_REQUEST_PLUGIN, readPullRequest } from "./source";

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

interface RpcArgs {
  pluginId: string;
  method: string;
  input: { keys: string[] };
  outputSchema: { parse(value: unknown): unknown };
}

/** An SDK whose callRpc answers with `rows` (or throws), validated like BB validates it. */
function rpcSdk(rows: Record<string, unknown> | Error, legacy?: () => Promise<unknown>) {
  const calls: Omit<RpcArgs, "outputSchema">[] = [];
  const sdk = {
    environments: legacy === undefined ? {} : { pullRequest: legacy },
    plugins: {
      callRpc: async ({ outputSchema, ...args }: RpcArgs) => {
        calls.push(args);
        if (rows instanceof Error) throw rows;
        return outputSchema.parse(rows);
      },
    },
  };
  return { sdk: sdk as unknown as Sdk, calls };
}

describe("readPullRequest", () => {
  it("asks bb--github-pr-status for the environment's row", async () => {
    const { sdk, calls } = rpcSdk({ env_a: { outcome: "available", pullRequest: PULL_REQUEST } });
    const answer = await readPullRequest(sdk, "env_a");
    expect(calls).toEqual([{ pluginId: PULL_REQUEST_PLUGIN, method: "pullRequests", input: { keys: ["env_a"] } }]);
    expect(answer).toMatchObject({ outcome: "available", pullRequest: { number: 7, state: "open" } });
  });

  it("passes on absent and unavailable rows, and treats a missing row as absent", async () => {
    expect(await readPullRequest(rpcSdk({ env_a: { outcome: "absent" } }).sdk, "env_a")).toEqual({ outcome: "absent" });
    expect(await readPullRequest(rpcSdk({ env_a: { outcome: "unavailable", message: "machine offline" } }).sdk, "env_a")).toEqual({
      outcome: "unavailable",
      message: "machine offline",
    });
    expect(await readPullRequest(rpcSdk({}).sdk, "env_a")).toEqual({ outcome: "absent" });
  });

  it("says the PR plugin didn't answer when the RPC fails and BB has no older API", async () => {
    const answer = await readPullRequest(rpcSdk(new Error("plugin bb--github-pr-status is disabled")).sdk, "env_a");
    expect(answer).toEqual({
      outcome: "unavailable",
      message: "The GitHub PR Status plugin (bb--github-pr-status) didn't answer: plugin bb--github-pr-status is disabled",
    });
  });

  it("uses sdk.environments.pullRequest on a BB that still has it, without the RPC", async () => {
    const legacy = async () => ({ outcome: "available", pullRequest: PULL_REQUEST });
    const { sdk, calls } = rpcSdk({}, legacy);
    expect(await readPullRequest(sdk, "env_a")).toMatchObject({ outcome: "available", pullRequest: { number: 7 } });
    expect(calls).toEqual([]);
  });

  it("says why when BB has neither way to read a pull request", async () => {
    const bare = { environments: {} } as unknown as Sdk;
    expect(await readPullRequest(bare, "env_a")).toEqual({ outcome: "unavailable", message: "This version of BB can't read pull requests" });
  });
});

describe("PullRequest()", () => {
  function source(rows: Record<string, unknown>, environment: Record<string, unknown> = { branchName: "feat" }) {
    const { sdk, calls } = rpcSdk(rows);
    const full = {
      ...sdk,
      threads: { get: async () => ({ id: "thr_mine00", projectId: "proj_a", environmentId: "env_a", deletedAt: null }) },
      environments: { get: async () => environment },
    };
    return { source: createProjectSource({ sdk: full } as unknown as BbPluginApi, { get: async () => undefined, set: async () => {} }), calls };
  }

  it("shows the branch's pull request read over the RPC (no sdk.environments.pullRequest needed)", async () => {
    const { source: read } = source({ env_a: { outcome: "available", pullRequest: PULL_REQUEST } });
    const answer = await read.pullRequest("thr_mine00");
    expect(answer).toMatchObject({ ok: true, branch: "feat", pullRequest: { number: 7, checks: { state: "passing", passed: 2 } } });
  });

  it("shows no pull request, not an error, for a workspace that isn't a git repository", async () => {
    const { source: read } = source({ env_a: { outcome: "absent" } }, { branchName: null, isGitRepo: false });
    expect(await read.pullRequest("thr_mine00")).toMatchObject({ ok: true, branch: null, pullRequest: null });
  });
});
