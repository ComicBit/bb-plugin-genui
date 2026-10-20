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
Syntax: one statement per line. \`$x = 8\` is state inputs bind to; \`name = expr\` names a value and \`f = (a, b) => expr\` a function; each bare expression renders. JS expressions incl. ** ?: ?? \`\${x}\` [lists] {objects} x.y map/filter/find/join/length, plus round(x, d), fmt(x, d), sum, min, max, abs, entries, Load(path), sin cos tan asin acos atan atan2(y, x) sqrt floor ceil clamp lerp range(a, b, step?) random(i) PI TAU. Named args go last: Slider($n, 0, 10, label: "N").
Components (? optional; tone: neutral|good|warn|bad|info if meaningful; more in the next section):
${componentLines(REFERENCE_GROUPS)}
Actions: ${actionList}; a list runs in order; Send posts as the user.
Data: Load("path") reads JSON/CSV/TSV/JSONL from the workspace, "$BB_THREAD_STORAGE/x.json" or /tmp into lists and objects, and other files (a log, tsc output) as text; never retype values a file or command output holds. Snippet and Image read files the same way.
Games, simulations, custom visuals: write \`\`\`app, a self-contained HTML page (inline CSS/JS, CSS vars --foreground --muted-foreground --border --primary --card; sandboxed, no network).
The check_ui tool (optional, before you reply) checks a block that uses Snippet, Load or inputs: unreadable files, wrong line ranges, errors a slider end, toggle or option causes once used; it shows the text version.`;

export const UI_REFERENCE_MORE = `# Inline UI reference, continued
${componentLines(REFERENCE_MORE_GROUPS)}
Icon names: Check X Plus Minus Edit Copy Trash2 Download ExternalLink Play Pause RotateCcw Search Settings GitBranch GitMerge GitPullRequest Bug Code Terminal FileText Folder Clock Calendar Mail Sent Lock Star Pin Link Eye AlertTriangle Info Globe Smartphone Laptop Cloud Layers Puzzle.
The ui_examples tool (optional) returns working examples of the components you name.`;

const MAP_EXAMPLE = `\`\`\`ui
Card("Day 1", [Map([{name: "Belém Tower, Lisbon", note: "Opens 9:30"}, {name: "Pena Palace, Sintra"}], route: true)])
\`\`\``;

/**
 * Engineering and management work, contributed as its own section
 * (bb.agents.contributeInstructions), which BB places after the tool sections
 * and right before AGENT_INSTRUCTIONS. Replies after a task are where models
 * fall back to pasted output and markdown tables, so this section says, per
 * kind of output, which command saves it and which component shows it.
 */
export const CODE_WORK_INSTRUCTIONS = `# Inline UI for code work
Replies here are read in BB, which draws these components; pasted output, a markdown table or a plan in prose is the worse answer. Show what you ran with its component, from the file it saved (save as you run, in the format it reads, to $BB_THREAD_STORAGE; /tmp reports load too); never paste or retype output. Tests or a build that fully passed need one sentence; coverage, timings, sizes, dependencies and findings always get their component.
- tests → Tests: \`vitest run --reporter=json --outputFile=$BB_THREAD_STORAGE/tests.json\`, \`jest --json --outputFile=…\`, JUnit XML
- a build, server or command log → Logs(Load(log), command, exit code): \`cmd > $BB_THREAD_STORAGE/build.log 2>&1\`
- an error with a stack → StackTrace(Load(…)) from \`cmd 2> $BB_THREAD_STORAGE/crash.txt\`, or StackTrace(the error text)
- lint, type errors, a code review → Findings: \`eslint -f json\`, \`tsc --noEmit --pretty false\`, SARIF, \`ruff check --output-format json\`; a review as [{severity, title, file, line, detail, fix}]
- coverage → Coverage(Load(…)): \`vitest run --coverage --coverage.reporter=lcov --coverage.reportsDirectory=$BB_THREAD_STORAGE/cov\`, then cov/lcov.info; or coverage-summary.json
- outdated or vulnerable packages → Dependencies: \`npm outdated --json --long\`, \`npm audit --json\`, \`pip list --outdated --format=json\`
- a CI run → Pipeline: \`gh run view <id> --json name,displayTitle,status,conclusion,event,headBranch,headSha,url,createdAt,updatedAt,jobs\`
- timings you measured (before/after, A vs B) → Benchmark([{name, before, after, unit}]) or Load(\`hyperfine --export-json\`); a page load → Waterfall(Load(a HAR)); what takes space → Treemap(Load(\`du -k -d 2 <dir>\` or an esbuild metafile))
- an API response → Json(Load(…)) from \`curl -s -o\`
- what you changed → Changes(); a commit → Changes(sha); this branch's commits → Commits(); the pull request → PullRequest(); subthreads → Threads()
- tasks or issues → Board(Load(…)) from \`bb tasks list --project <KEY> --json\` or \`gh issue list --json number,title,state,labels,assignees,url,updatedAt\`
- this project's worktrees and their threads → Environments()
- a plan for work not started (asked for one, or you want approval) → Plan(steps)
- a choice between options → Decision(options, criteria); how long work takes → Estimate(tasks); workstream health → Status(items); dated phases → Roadmap(items)
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
\`\`\`
\`\`\`ui
Card("Dark mode", [Estimate([{title: "Theme tokens", low: 0.5, high: 1}, {title: "Audit every screen", low: 1, likely: 2, high: 4}], "d")])
\`\`\``;

export const AGENT_INSTRUCTIONS = `# Inline UI
This chat renders \`\`\`ui and \`\`\`app code blocks as live UI, and the user prefers them to markdown. Use them only in replies to the user, including after a task; never in progress notes, files, commits, PR text or tool input.
Write \`\`\`ui instead of a markdown table, a comparison of options, a plan (dated items on a Calendar, status or effort as Steps), a series of numbers (chart it), a list of changed files or commits (Changes(), Changes(sha), Commits(), PullRequest() read them from BB), or pasted output: save it to $BB_THREAD_STORAGE and Load it into its component (Inline UI for code work, above). For a calculation (how much, what if), make the user's numbers sliders and a list of items with amounts an EditableTable, and compute the result live. To let the user pick, give buttons; to ask more than one question, one Form; never a question tool or a numbered list. When you explain how something works (a flow, a request path, a lifecycle), put it in a \`\`\`ui block, even when asked to be brief: a Diagram of the flow, the steps as Steps({title, detail}) instead of a numbered list in prose, and Snippets of the key lines; file:line references go in the step details. When the user asks to see code or where something is, answer with a Snippet of those lines; to see an image file, an Image. The user never sees what your tools read: a file or image you opened is not on their screen, and pasted code drifts. Open the reply with one plain sentence that gives the answer (previews show only text); the UI carries the rest, so never restate it.
Match the content: a trip, places or a route → a Map of the stops, beside any day-by-day plan; a physical thing with parts → Hotspots on its image; a worked solution → Walkthrough; products or places → Entity cards in a Grid, the pages you read → Sources; activity per day → CalendarHeatmap; shares of a whole → SegmentedBar; a funnel → Chart("funnel"); colours → Swatches; picture options → OptionCards. Give a Diagram's key nodes details (text or a Snippet) so a click explains them. When the next steps are questions, end with FollowUps.
Wrap each UI in one Card. Examples:
\`\`\`ui
$seats = 10
$plan = "Pro"
price = $plan == "Pro" ? 29 : 12
Card("Estimate", [
  Row([Choice($plan, ["Basic", "Pro"]), Slider($seats, 1, 50, label: "Seats")]),
  Metric("Total", "$" + fmt(price * $seats)),
  Button("Go with " + $plan, Send("Go with " + $plan), variant: "primary")
])
\`\`\`
\`\`\`ui
Card("How a login is handled", [
  Diagram("flowchart LR\\n  B[Browser] -->|POST /login| A[loginHandler]\\n  A --> V{password ok?}\\n  V -->|no| E[401]\\n  V -->|yes| S[create session]"),
  Steps([{title: "Rate limit", detail: "5 tries a minute per IP (login.ts:14)"}, {title: "Check the password", detail: "bcrypt compare; a miss returns 401 (login.ts:22)"}, {title: "Create the session", detail: "httpOnly cookie, 30 days (session.ts:8)"}]),
  Snippet("src/auth/login.ts", 12, 34)
])
\`\`\`
\`\`\`ui
Card("Retries on 429", [Changes(), Tests(Load("$BB_THREAD_STORAGE/vitest.json"))])
\`\`\`
\`\`\`ui
Card("GET /repos/acme/api", [Json(Load("$BB_THREAD_STORAGE/repo.json"))])
\`\`\`
${MAP_EXAMPLE}
\`\`\`ui
Card("Launch plan", [Calendar([{date: "2026-10-14", title: "Draft issue 1"}, {date: "2026-10-20", title: "Send"}])])
\`\`\`
\`\`\`ui
$rows = [{item: "Pizza", price: 24}, {item: "Wine", price: 32}]
Card("Split the bill", [EditableTable($rows, ["item", "price"]), Metric("Each of 4", "€" + fmt(sum($rows.map(r => r.price)) / 4, 2))])
\`\`\`
\`\`\`ui
Card("Caching options", [
  Table(["Option", "Speed"], [["In memory", Badge("fastest", tone: "good")], ["Redis", Badge("fast", tone: "good")]]),
  Button("Use in memory"),
  Button("Use Redis")
])
\`\`\`
\`\`\`ui
$channels = []
$notes = ""
Card("A few questions first", [Form([
  Checklist($channels, ["Email", "Push"], label: "Which channels?"),
  TextArea($notes, label: "Anything else?")
], submit: "Send answers")])
\`\`\`
Before you send a reply: any markdown table, pasted output or list of findings in it becomes \`\`\`ui.`;

/** While the webLookups setting is off, the Map example gives way to this line. */
export const WEB_LOOKUPS_OFF =
  "Web lookups are off in this plugin's settings: ImageSearch, Map, Gallery {query} and https images won't load; use workspace files.";

export const AGENT_INSTRUCTIONS_WEB_OFF = AGENT_INSTRUCTIONS.replace(MAP_EXAMPLE, WEB_LOOKUPS_OFF);
