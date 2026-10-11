// Plain-markdown version of a reply for places that show message text without
// running the UI: the CLI, SDK consumers and other agents. ```ui blocks become
// their static markdown rendering (ChatGPT keeps a `fallbackMarkdown` beside
// every UI for the same reason); ```app blocks become a one-line pointer.
// Image searches are resolved first, when a finder is given, so the markdown
// shows the photos the UI would.
import {
  collectLoads,
  compile,
  compileStreaming,
  dataKey,
  evaluate,
  formatDiagnostics,
  imageSearches,
  initialState,
  specToMarkdown,
  type DataRequest,
  type LoadedData,
  type SearchedImage,
} from "./core";
import { projectRequests, toMarkdownWithProject } from "./core/markdown";
import { projectRequestKey, type ProjectRequest, type ProjectResult } from "./core/project";
import type { UiNode } from "./core/types";

/** Fetches one file a spec reads: parsed for Load, raw text for Snippet. */
type Loader = (request: DataRequest) => Promise<LoadedData>;

/** The photo an image search finds, or null (nothing found, or web lookups off). */
type ImageFinder = (query: string) => Promise<SearchedImage | null>;

/** Reads the reply's thread's state from BB for Changes, Commits, PullRequest, Threads and Environments. */
export type ProjectReader = (request: ProjectRequest) => Promise<ProjectResult>;

async function findImages(roots: readonly UiNode[], find: ImageFinder | undefined): Promise<Map<string, SearchedImage | null>> {
  if (find === undefined) return new Map();
  return new Map(await Promise.all(imageSearches(roots).map(async (query) => [query, await find(query)] as const)));
}

/** `roots` as markdown, with image searches and BB reads resolved. */
async function rootsMarkdown(roots: readonly UiNode[], find: ImageFinder | undefined, project: ProjectReader | undefined): Promise<string> {
  const requests = project === undefined ? [] : projectRequests(roots);
  const [images, answers] = await Promise.all([
    findImages(roots, find),
    Promise.all(requests.map(async (request) => [projectRequestKey(request), await project!(request)] as const)),
  ]);
  return toMarkdownWithProject(roots, images, new Map(answers));
}

interface Fence {
  /** Line indexes of the opening and closing fence lines. */
  open: number;
  close: number;
  language: string;
  body: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)/;

/** Top-level fenced blocks, matching CommonMark's closing rule (same character, at least as long). */
function findFences(lines: readonly string[]): Fence[] {
  const fences: Fence[] = [];
  for (let index = 0; index < lines.length; index++) {
    const open = FENCE_OPEN.exec(lines[index] ?? "");
    if (open === null) continue;
    const marker = open[1] ?? "```";
    const closing = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
    let close = index + 1;
    while (close < lines.length && !closing.test(lines[close] ?? "")) close++;
    fences.push({
      open: index,
      close,
      language: (open[2] ?? "").toLowerCase(),
      body: lines.slice(index + 1, close).join("\n"),
    });
    index = close;
  }
  return fences;
}

function appPointer(html: string): string {
  const title = /<title>([^<]{1,120})<\/title>/i.exec(html)?.[1]?.trim();
  return `_Interactive app${title ? `: ${title}` : ""}. Open this reply in BB to use it._`;
}

async function uiMarkdown(spec: string, load: Loader, find: ImageFinder | undefined, project: ProjectReader | undefined): Promise<string> {
  const { program } = compileStreaming(spec);
  const requests = program === null ? [] : collectLoads(program);
  const data = new Map(await Promise.all(requests.map(async (request) => [dataKey(request), await load(request)] as const)));
  const compiled = compile(spec);
  // A spec that doesn't compile comes back as its source in a fence.
  if (compiled.program === null) return specToMarkdown(spec, data);
  const { roots } = evaluate(compiled.program, initialState(compiled.program, data), data);
  return rootsMarkdown(roots, find, project);
}

/** The reply with every ```ui and ```app block replaced by readable markdown. */
export async function renderReplyMarkdown(text: string, load: Loader, find?: ImageFinder, project?: ProjectReader): Promise<string> {
  const lines = text.split("\n");
  const fences = findFences(lines).filter((fence) => fence.language === "ui" || fence.language === "app");
  if (fences.length === 0) return text;
  const output: string[] = [];
  let next = 0;
  for (const fence of fences) {
    output.push(...lines.slice(next, fence.open));
    output.push(fence.language === "app" ? appPointer(fence.body) : await uiMarkdown(fence.body, load, find, project));
    next = fence.close + 1;
  }
  output.push(...lines.slice(next));
  return output.join("\n");
}

/**
 * What the check_ui tool tells the agent about one ```ui block: why it fails
 * to compile, which files Load and Snippet can't read, evaluation errors, and
 * otherwise the text version of what the user will see.
 */
export async function checkSpec(
  spec: string,
  load: Loader,
  find?: ImageFinder,
  project?: ProjectReader,
): Promise<{ readonly ok: boolean; readonly report: string }> {
  const compiled = compile(spec);
  if (compiled.program === null) {
    return { ok: false, report: `The block does not compile:\n${formatDiagnostics(compiled.diagnostics)}` };
  }
  const requests = collectLoads(compiled.program);
  const loaded = await Promise.all(requests.map(async (request) => [request, await load(request)] as const));
  const data = new Map(loaded.map(([request, result]) => [dataKey(request), result] as const));
  const { roots, diagnostics } = evaluate(compiled.program, initialState(compiled.program, data), data);
  const problems = [
    ...loaded.flatMap(([request, result]) => (result.ok ? [] : [`${request.path}: ${result.error}`])),
    ...(diagnostics.length > 0 ? [formatDiagnostics(diagnostics)] : []),
  ];
  const preview = `Text version of what the user will see:\n\n${await rootsMarkdown(roots, find, project)}`;
  return problems.length === 0
    ? { ok: true, report: `No errors. ${preview}` }
    : { ok: false, report: `Fix before replying:\n${problems.join("\n")}\n\n${preview}` };
}
