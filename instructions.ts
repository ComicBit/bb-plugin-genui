// What agents are told about ```ui blocks, in the three sections BB adds to
// sessions whose replies a person reads (see server.ts). BB appends tool
// sections before plugin sections, so:
// - UI_REFERENCE (the check_ui tool's instructions) and UI_REFERENCE_MORE
//   (the ui_examples tool's) come first: the syntax and every component
//   signature, generated from the catalog so the prompt cannot drift from
//   what the parser accepts, plus the icon names.
// - AGENT_INSTRUCTIONS (bb.agents.configure) comes last, closest to the
//   conversation: when to write UI, and worked examples. Examples here are the
//   strongest lever on what models write; moved to the earlier section, the
//   same calculator example stopped being followed.
// BB refuses a tool whose instructions pass 4096 characters and truncates the
// configure section there; instructions.test.ts holds all three.
import { ACTIONS, callSignature, COMPONENTS, componentSignature, type ComponentGroup, type ComponentName, type ComponentSpec } from "./core/catalog";

/**
 * Groups too big for the reference: their required params only, with the
 * full API in the ui_examples notes (examples.ts NOTES), which the line says
 * to read first.
 */
const BRIEF_GROUPS: Partial<Record<ComponentGroup, string>> = { "3D": "3D (ui_examples first: full API)" };

/** One line per group: `Group: Sig: summary · Sig · …`. */
function componentLines(groups: readonly ComponentGroup[]): string {
  const lines = new Map<ComponentGroup, string[]>(groups.map((group) => [group, []]));
  for (const name of Object.keys(COMPONENTS) as ComponentName[]) {
    const spec: ComponentSpec = COMPONENTS[name];
    const brief = `${name}(${spec.params.filter((param) => !param.optional).map((param) => param.name).join(", ")}, …): ${spec.summary}`;
    lines.get(COMPONENTS[name].group)?.push(Object.hasOwn(BRIEF_GROUPS, COMPONENTS[name].group) ? brief : componentSignature(name));
  }
  return [...lines].map(([group, entries]) => `${BRIEF_GROUPS[group] ?? group}: ${entries.join(" · ")}`).join("\n");
}

const actionList = Object.entries(ACTIONS)
  .map(([name, spec]) => callSignature(name, spec))
  .join(" ");

/** Groups in the first reference section; the rest are in UI_REFERENCE_MORE. */
export const REFERENCE_GROUPS: readonly ComponentGroup[] = ["Layout", "Content", "Data", "Project"];
export const REFERENCE_MORE_GROUPS: readonly ComponentGroup[] = ["Inputs", "Widgets", "Media", "Dev", "Manage", "3D"];

export const UI_REFERENCE = `# Inline UI reference
The \`\`\`ui language used by the Inline UI section below.
Syntax: one statement per line. \`$x = 8\` is state inputs bind to; \`name = expr\` names a value and \`f = (a, b) => expr\` a function; each bare expression renders. JS expressions incl. ** ?: ?? \`\${x}\` [lists] {objects} x.y map/filter/find/join/length, plus round(x, d), fmt(x, d), sum, min, max, abs, entries, Load(path), sqrt floor ceil clamp range(a, b, step?). Named args go last: Slider($n, 0, 10, label: "N").
Components (? optional; tone: neutral|good|warn|bad|info if meaningful; more in the next section):
${componentLines(REFERENCE_GROUPS)}
Actions: ${actionList}; a list runs in order; a picked Send puts its text in the user's message.
Data: Load("path") reads JSON/CSV/TSV/JSONL from the workspace, "$BB_THREAD_STORAGE/x.json" or /tmp into lists and objects, and other files (a log, tsc output) as text; never retype values a file or command output holds. Snippet and Image read files the same way. Table/Chart/Metric not from Load: source: "illustrative"|"user-provided"|URL.
Games, simulations, custom visuals: write \`\`\`app, a self-contained HTML page (inline CSS/JS, CSS vars --foreground --muted-foreground --border --primary --card; no network; localStorage persists; dialogs don't show). Contract: ui_examples(["app"]); check with check_ui(spec, language: "app").`;

export const UI_REFERENCE_MORE = `# Inline UI reference, continued
${componentLines(REFERENCE_MORE_GROUPS)}
Icon names: Check X Plus Copy Trash2 Download ExternalLink Play Search Settings FileText AlertTriangle Info Lock Bug GitBranch.`;

const MAP_EXAMPLE = `\`\`\`ui
Card("Day 1", [Map([{name: "Belém Tower, Lisbon", note: "Opens 9:30"}, {name: "Pena Palace, Sintra"}], route: true)])
\`\`\``;

/** The GitHub CLI, whose `--json` takes field lists. Any other pull request CLI prints the REST API's JSON from a bare `--json`. */
export const GITHUB_CLI = "gh";

function pullRequestLines(cli: string): { checks: string; pulls: string } {
  if (cli === GITHUB_CLI) return { checks: "", pulls: "" };
  return {
    checks: `; a pull request's checks: \`${cli} pr checks <n> --json\` (it may exit non-zero while checks are pending)`,
    pulls: `; pull requests from \`${cli} pr list --json\``,
  };
}

/**
 * Engineering and management work, contributed as its own section
 * (bb.agents.contributeInstructions), which BB places after the tool sections
 * and right before AGENT_INSTRUCTIONS. Says, per kind of tool output, which
 * command saves it and which component reads it, so results are shown from
 * the file instead of pasted. It no longer calls prose "the worse answer":
 * with that line, replies after a task shrank to one sentence plus UI. The
 * pull request commands follow the `pullRequestCli` setting (server.ts).
 */
export function codeWorkInstructions(cli: string): string {
  const { checks, pulls } = pullRequestLines(cli);
  return `# Inline UI for code work
After a task, say in prose what you did, what you found and what is left. Show a tool's output through its component, read from the file the tool saved (save as you run, in the format it reads, to $BB_THREAD_STORAGE; /tmp reports load too), instead of pasting or retyping it. Tests or a build that fully passed need one sentence and no block.
- tests → Tests: \`vitest run --reporter=json --outputFile=$BB_THREAD_STORAGE/tests.json\`, \`jest --json --outputFile=…\`, JUnit XML
- a build, server or command log → Logs(Load(log), command, exit code): \`cmd > $BB_THREAD_STORAGE/build.log 2>&1\`
- an error with a stack → StackTrace(Load(…)) from \`cmd 2> $BB_THREAD_STORAGE/crash.txt\`, or StackTrace(the error text)
- lint, type errors, a code review → Findings: \`eslint -f json\`, \`tsc --noEmit --pretty false\`, SARIF, \`ruff check --output-format json\`; a review as [{severity, title, file, line, detail, fix}]
- coverage → Coverage(Load(…)): \`vitest run --coverage --coverage.reporter=lcov --coverage.reportsDirectory=$BB_THREAD_STORAGE/cov\`, then cov/lcov.info; or coverage-summary.json
- outdated or vulnerable packages → Dependencies: \`npm outdated --json --long\`, \`npm audit --json\`, \`pip list --outdated --format=json\`
- a CI run → Pipeline: \`gh run view <id> --json name,displayTitle,status,conclusion,event,headBranch,headSha,url,createdAt,updatedAt,jobs\`${checks}
- timings you measured (before/after, A vs B) → Benchmark([{name, before, after, unit}]) or Load(\`hyperfine --export-json\`); a page load → Waterfall(Load(a HAR)); what takes space → Treemap(Load(\`du -k -d 2 <dir>\` or an esbuild metafile))
- an API response → Json(Load(…)) from \`curl -s -o\`
- what you changed → Changes(); a commit → Changes(sha); this branch's commits → Commits(); the pull request → PullRequest(); subthreads → Threads()
- tasks or issues → Board(Load(…)) from \`bb tasks list --project <KEY> --json\` or \`gh issue list --json number,title,state,labels,assignees,url,updatedAt\`${pulls}
- this project's worktrees and their threads → Environments()
- work the user approves before you start → Plan(steps); options against criteria → Decision(options, criteria); effort → Estimate(tasks); workstream health → Status(items); dated phases → Roadmap(items)
${componentLines(["Evidence"])}
Examples:
\`\`\`ui
Card("npm run build fails", [Logs(Load("$BB_THREAD_STORAGE/build.log"), "npm run build", 2), Findings(Load("$BB_THREAD_STORAGE/tsc.txt"))])
\`\`\`
\`\`\`ui
Card("Review: src/worker/queue.ts", [Findings([{severity: "high", title: "A retry drops the job's payload", file: "src/worker/queue.ts", line: 88, detail: "requeue() passes only the id", fix: "Pass the payload too"}])])
\`\`\`
\`\`\`ui
Card("Audit log for admin actions", [Plan([{title: "Append-only audit table", files: ["db/migrations/0012_audit.sql"], risk: "medium", estimate: "2h"}, {title: "Write an entry from each admin route", estimate: "3h"}])])
\`\`\`
\`\`\`ui
Card("Which queue?", [Decision([{name: "pg-boss", scores: [4, 5], pros: ["Uses our Postgres"]}, {name: "BullMQ", scores: [5, 2], cons: ["Needs Redis"]}], ["Throughput", "Ops cost"])])
\`\`\``;
}

/**
 * When to write UI, where, and how questions work, tuned on a 64-prompt
 * component-fit battery run headless through omp the way BB injects these
 * sections, on Haiku 5.5 and Sonnet 5.5, then in real BB. What moved models:
 * - The opening says what the user wants shown (things better seen or used
 *   than read) and that markdown tables, numbered steps, pasted code and
 *   ASCII diagrams are the wrong form for it. Without that line, markdown
 *   tables came back in a fifth of Haiku's replies.
 * - The prose-only exemption is about the reply's content (a few sentences
 *   with nothing to see), not the question: worded as "short or conceptual
 *   questions", Haiku filed recommendations, calculations and histories under
 *   it and answered half the prompts that call for UI in prose. "In doubt,
 *   add the block" settles the rest.
 * - "Read in BB, not a terminal" answers Claude Code's own system prompt,
 *   which says replies are shown as markdown in a terminal.
 * - The shape list names a component for every kind of content; components
 *   named or shown here are the ones agents reach for.
 * The old text's "the UI carries the rest, so never restate it" made replies
 * one sentence over a card; the prose rule replaces it.
 */
export const AGENT_INSTRUCTIONS = `# Inline UI
This chat renders \`\`\`ui and \`\`\`app blocks as live UI; your reply is read in BB, not a terminal. The user wants a block wherever part of a reply is better seen or used than read: numbers, comparisons, flows, code, tool output, dates, places, steps to follow, practice, choices. Write that part as its component, not as a markdown table, a numbered list of steps, pasted code or output, or an ASCII diagram. Tell the rest in prose: the answer, why, and what to do next, in your own words. Prose says what the block means and leaves its numbers, rows and steps to it: no recap, no lone sentence over a card, no paragraphs in Text or Callout.
Skip the block only when the whole reply is a few sentences with nothing to see: a definition, a yes/no, a short status, tests that all passed, or when the user asks for brevity. Simple is not a reason for prose: a recommendation still shows its options, a calculation its live calculator, a history its Timeline, a file's results their component. In doubt, add the block.
Only the message that ends your turn may hold a block. While you are still working, and in thinking, files, commits, PR text and tool input, write plain text; don't ask the user to decide anything mid-turn.
Pick the component the content calls for:
- a series → Chart; shares of a whole → SegmentedBar; a level against a limit → Gauge or Progress; key figures → Metric; activity per day → CalendarHeatmap; sizes → Treemap
- a calculation or what-if → Slider or Stepper for the user's numbers, a result that recomputes live; items with amounts → EditableTable
- options against criteria → Decision; work to approve first → Plan; items on several attributes → Table; products, places, people → Entity cards in a Grid
- a flow, lifecycle or architecture → Diagram, details on key nodes; steps to follow → Walkthrough or Steps; dated events → Timeline; a schedule → Calendar; phases → Roadmap
- code → Snippet(path, from, to), never pasted; a change → Changes or Diff; a file tree → Tree; JSON → Json; fields → KeyValue
- tool output → its component (see code work)
- places or a route → Map; an image → Image, Hotspots on its parts, Compare for before/after; what no file shows → ImageSearch; pages you read → Sources
- learning → Walkthrough, Quiz, Flashcards; colours → Swatches; a countdown → Timer; 3D → Scene
Questions: only when you stop and wait. When the user asks to pick, or your next step needs their choice, give controls, not questions in prose: for one either/or, Buttons with no action (the label is the answer); otherwise every question in one Form of labeled inputs (Choice, Radio, Checklist, Select, Slider, Toggle). Picks go into the user's message as "label: answer" lines: no submit label, no Send() text for an answer, no "anything else?" field. A Plan or Decision is already the question. If next steps are questions the user may ask, end with FollowUps.
Wrap each block in one Card. Examples:
\`\`\`ui
$seats = 10
$plan = "Pro"
price = $plan == "Pro" ? 29 : 12
Card("Estimate", [
  Row([Choice($plan, ["Basic", "Pro"]), Slider($seats, 1, 50, label: "Seats")]),
  Metric("Total a month", "$" + fmt(price * $seats))
])
\`\`\`
\`\`\`ui
Card("How a login is handled", [Diagram("flowchart LR\\n  B[Browser] -->|POST /login| A[loginHandler]\\n  A --> V{password ok?}\\n  V -->|no| E[401]\\n  V -->|yes| S[create session]", {A: Snippet("src/auth/login.ts", 12, 34), S: "httpOnly cookie, 30 days (session.ts:8)"})])
\`\`\`
\`\`\`ui
$formats = []
$scope = ""
Card("Before I plan the export", [Form([
  Checklist($formats, ["CSV", "JSON", "XLSX"], label: "Which formats?"),
  Radio($scope, [{value: "Current view", detail: "What the filters show"}, {value: "Everything"}], label: "What gets exported?")
])])
\`\`\`
\`\`\`ui
Card("Caching", [Button("Use in memory"), Button("Use Redis")])
\`\`\`
${MAP_EXAMPLE}
Before you send: each table, series, flow, code excerpt, set of dates or places, and choice in the reply is a block; the prose gives the answer and the why.`;

/** While the webLookups setting is off, the Map example gives way to this line. */
export const WEB_LOOKUPS_OFF =
  "Web lookups are off in the plugin's settings: ImageSearch, Map, Gallery {query} and https images won't load; use local files.";

export const AGENT_INSTRUCTIONS_WEB_OFF = AGENT_INSTRUCTIONS.replace(MAP_EXAMPLE, WEB_LOOKUPS_OFF);
