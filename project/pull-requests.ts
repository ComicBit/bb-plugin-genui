// Pull requests for PullRequest and Environments. BB up to 0.48 answered
// sdk.environments.pullRequest; BB 0.49 dropped it and serves pull requests
// from its GitHub PR Status plugin (bb--github-pr-status), whose
// `pullRequests` RPC reads up to 200 environments at once. Reads that come
// within a few milliseconds of each other share one call, and each row is
// checked on its own: one genui can't show doesn't hide the others.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  ATTENTION_LABEL,
  CHECKS_LABEL,
  MERGEABILITY_LABEL,
  PR_STATE_LABEL,
  REVIEW_LABEL,
  type PullRequestInfo,
} from "../core/project";

type Sdk = BbPluginApi["sdk"];

/** The plugin that reads pull requests since BB dropped `environments.pullRequest`. */
export const PULL_REQUEST_PLUGIN = "bb--github-pr-status";

/** Most environments one `pullRequests` call takes. */
export const PULL_REQUEST_BATCH = 200;

/** How long a read waits for others to share its call. */
const PULL_REQUEST_WINDOW_MS = 5;

/** The fields of a pull request (bb--github-pr-status, or BB's older environments.pullRequest) genui reads. */
export interface PullRequestEntry {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: PullRequestInfo["state"];
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly checks: {
    readonly state: PullRequestInfo["checks"]["state"];
    readonly passedCount: number;
    readonly failedCount: number;
    readonly pendingCount: number;
    readonly totalCount: number;
  };
  readonly review: { readonly state: PullRequestInfo["review"]["state"]; readonly reviewRequestCount: number };
  readonly mergeability: { readonly state: PullRequestInfo["mergeability"] };
  readonly attention: PullRequestInfo["attention"];
  readonly autoMerge: boolean;
  readonly inMergeQueue: boolean | null;
  readonly updatedAt: string;
}

/** BB's answer for one environment's pull request. */
export type PullRequestAnswer =
  | { readonly outcome: "available"; readonly pullRequest: PullRequestEntry }
  | { readonly outcome: "absent" }
  | { readonly outcome: "unavailable"; readonly message: string };

export interface PullRequestReader {
  /** The pull request on the environment's branch. Never rejects: a read that fails is "unavailable". */
  read(environmentId: string): Promise<PullRequestAnswer>;
}

type Row = Readonly<Record<string, unknown>>;

/** callRpc wants a schema for the answer; the rows themselves are checked by pullRequestRow. */
const ROWS = z.record(z.string(), z.unknown());

export function pullRequestInfo(pr: PullRequestEntry): PullRequestInfo {
  const updatedAt = Date.parse(pr.updatedAt);
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    checks: {
      state: pr.checks.state,
      passed: pr.checks.passedCount,
      failed: pr.checks.failedCount,
      pending: pr.checks.pendingCount,
      total: pr.checks.totalCount,
    },
    review: { state: pr.review.state, requests: pr.review.reviewRequestCount },
    mergeability: pr.mergeability.state,
    attention: pr.attention,
    autoMerge: pr.autoMerge,
    inMergeQueue: pr.inMergeQueue === true,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
  };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function rowOf(value: unknown): Row | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Row) : null;
}

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** One of the values `labels` names, so genui has words for it. */
function isKnown(labels: object, value: unknown): boolean {
  return typeof value === "string" && Object.hasOwn(labels, value);
}

/** The first field of `value` genui can't show, or null when it can show all of them. */
function unreadableField(value: unknown): string | null {
  const pr = rowOf(value);
  if (pr === null) return "pullRequest";
  if (!isCount(pr.number) || pr.number === 0) return "number";
  for (const key of ["title", "url", "baseRefName", "headRefName", "updatedAt"]) if (typeof pr[key] !== "string") return key;
  if (!isKnown(PR_STATE_LABEL, pr.state)) return "state";
  const checks = rowOf(pr.checks);
  if (checks === null || !isKnown(CHECKS_LABEL, checks.state)) return "checks";
  for (const key of ["passedCount", "failedCount", "pendingCount", "totalCount"]) if (!isCount(checks[key])) return `checks.${key}`;
  const review = rowOf(pr.review);
  if (review === null || !isKnown(REVIEW_LABEL, review.state) || !isCount(review.reviewRequestCount)) return "review";
  if (!isKnown(MERGEABILITY_LABEL, rowOf(pr.mergeability)?.state)) return "mergeability";
  if (!isKnown(ATTENTION_LABEL, pr.attention)) return "attention";
  if (typeof pr.autoMerge !== "boolean") return "autoMerge";
  if (pr.inMergeQueue !== null && typeof pr.inMergeQueue !== "boolean") return "inMergeQueue";
  return null;
}

/** One environment's row as genui shows it: no row is no pull request; a row it can't read says which field. */
export function pullRequestRow(value: unknown): PullRequestAnswer {
  if (value === undefined) return { outcome: "absent" };
  const row = rowOf(value);
  if (row?.outcome === "absent") return { outcome: "absent" };
  if (row?.outcome === "unavailable" && typeof row.message === "string") return { outcome: "unavailable", message: row.message };
  if (row?.outcome === "available") {
    const field = unreadableField(row.pullRequest);
    if (field === null) return { outcome: "available", pullRequest: row.pullRequest as PullRequestEntry };
    return { outcome: "unavailable", message: `The GitHub PR Status plugin sent a pull request genui can't show (${field})` };
  }
  return { outcome: "unavailable", message: "The GitHub PR Status plugin sent an answer genui can't read" };
}

export function createPullRequestReader(sdk: Sdk, windowMs = PULL_REQUEST_WINDOW_MS): PullRequestReader {
  const waiting = new Map<string, { readonly answer: Promise<PullRequestAnswer>; readonly settle: (answer: PullRequestAnswer) => void }>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function ask(keys: string[]): Promise<PullRequestAnswer[]> {
    try {
      const rows = await sdk.plugins.callRpc({ pluginId: PULL_REQUEST_PLUGIN, method: "pullRequests", input: { keys }, outputSchema: ROWS });
      return keys.map((key) => pullRequestRow(rows[key]));
    } catch (cause) {
      const message = `The GitHub PR Status plugin (${PULL_REQUEST_PLUGIN}) didn't answer: ${errorMessage(cause)}`;
      return keys.map(() => ({ outcome: "unavailable", message }));
    }
  }

  function flush() {
    timer = null;
    const batch = [...waiting];
    waiting.clear();
    for (let start = 0; start < batch.length; start += PULL_REQUEST_BATCH) {
      const part = batch.slice(start, start + PULL_REQUEST_BATCH);
      void ask(part.map(([key]) => key)).then((answers) => part.forEach(([, read], index) => read.settle(answers[index]!)));
    }
  }

  return {
    async read(environmentId) {
      const legacy = (sdk.environments as { pullRequest?: (args: { environmentId: string }) => Promise<unknown> }).pullRequest;
      if (typeof legacy === "function") {
        try {
          return pullRequestRow(await legacy.call(sdk.environments, { environmentId }));
        } catch (cause) {
          return { outcome: "unavailable", message: errorMessage(cause) };
        }
      }
      if (typeof (sdk as { plugins?: Partial<Sdk["plugins"]> }).plugins?.callRpc !== "function") {
        return { outcome: "unavailable", message: "This version of BB can't read pull requests" };
      }
      const pending = waiting.get(environmentId);
      if (pending !== undefined) return pending.answer;
      let settle!: (answer: PullRequestAnswer) => void;
      const answer = new Promise<PullRequestAnswer>((resolve) => (settle = resolve));
      waiting.set(environmentId, { answer, settle });
      timer ??= setTimeout(flush, windowMs);
      return answer;
    },
  };
}
