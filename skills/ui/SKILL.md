---
name: ui
description: Use only when the user invokes /ui or explicitly asks to use the Generative UI plugin for interactive replies.
---

Use these instructions for the requested interactive UI replies. Read component examples with ui_examples as needed and validate blocks with check_ui.

Web-dependent components require the plugin's Web lookups setting. Check it with `bb plugin config genui` before using ImageSearch, Map, Gallery searches or https images. If disabled, use local files instead.

# Inline UI reference
The ```ui language used by the Inline UI section below.
Syntax: one statement per line. `$x = 8` is state inputs bind to; `name = expr` names a value and `f = (a, b) => expr` a function; each bare expression renders. JS expressions incl. ** ?: ?? `${x}` [lists] {objects} x.y map/filter/find/join/length, plus round(x, d), fmt(x, d), sum, min, max, abs, entries, Load(path), sqrt floor ceil clamp range(a, b, step?). Named args go last: Slider($n, 0, 10, label: "N").
Components (? optional; tone: neutral|good|warn|bad|info if meaningful; more in the next section):
Layout: Card(title, children) · Row(children): equal-width, wraps · Stack(children) · Grid(children, columns?): tiles · Tabs(labels, children) · Details(title, children, open?): collapsible · Divider() · Carousel(children): a swipeable row of cards
Content: Text(text, tone?): markdown · Callout(text, tone?, title?) · Metric(label, value, note?, tone?): key number; 2-4 in a Row · Badge(text, tone?): 1-3 word status; explain in the next cell · Icon(name, tone?): lucide name · KeyValue(pairs): object or [[k, v]] · Image(src, alt?): path or https URL; the only way the user sees an image (they never see images your tools open) · File(path, line?) · Entity(name, kind:product|place|person|org|link|other?, image?, facts?, url?, note?): a product, place or person card; facts {label: value} open in its detail view · Sources(links): https URLs or {url, title?, note?} · List(items): rows {title, detail?, icon?, value?, tone?, action?}
Data: Table(columns, rows): rows: lists of values or components · Chart(type:bar|line|area|pie|scatter|radar|funnel|heatmap|histogram|box, labels, series, unit?, stacked?): series: numbers or {name: numbers | {values, tone}}; labels: scatter x values, histogram bin edges or []; heatmap: series = rows · Sparkline(values, tone?) · Progress(value, max?, label?, tone?): % without max · Steps(items): {title,detail?,status?:done|current|blocked} · Timeline(items): {time,title,detail?,tone?} · Tree(items): paths or {label,children?,note?} · Code(code, language?) · Snippet(path, from?, to?): lines of a file, 1-based · Diff(patch): unified, one file · Diagram(mermaid, details?): details {nodeId: text or components} open when that node is clicked · Calendar(events, month?): {date: yyyy-mm-dd, title, tone?} on a month grid; month yyyy-mm · Gauge(value, min?, max?, label?, tone?): a dial; max defaults to 100 · CalendarHeatmap(days, label?, tone?): {yyyy-mm-dd: count} or [{date, value}] · SegmentedBar(parts, unit?): shares of one whole: {label, value, tone?}
Project: Changes(target?, paths?): files changed in this thread's checkout with +/- and diffs; target: omit for the branch's work incl. uncommitted, "uncommitted", or a commit sha; paths filters · Commits(limit?): this branch's commits since the default branch, each opening its changes · PullRequest(): this branch's pull request: state, checks, review · Threads(ids?): live status of BB threads; omit ids for this thread's subthreads · Tests(results, title?): a Load()ed test report, or [{name, status: passed|failed|skipped, message?, file?, line?}] · Json(value, label?): collapsible JSON explorer; Load() a big file instead of retyping it
Actions: Send(text) Set($state, value) OpenUrl(url) Copy(text); a list runs in order; a picked Send puts its text in the user's message.
Data: Load("path") reads JSON/CSV/TSV/JSONL from the workspace, "$BB_THREAD_STORAGE/x.json" or /tmp into lists and objects, and other files (a log, tsc output) as text; never retype values a file or command output holds. Snippet and Image read files the same way. Table/Chart/Metric not from Load: source: "illustrative"|"user-provided"|URL.
External screenshots: copy into workspace, thread storage or /tmp first.
Games, simulations, custom visuals: write ```app, a self-contained HTML page (inline CSS/JS, CSS vars --foreground --muted-foreground --border --primary --card; no network; localStorage persists; dialogs don't show). Contract: ui_examples(["app"]); check with check_ui(spec, language: "app").

# Inline UI reference, continued
Inputs: Slider($value, min, max, step?, label?) · Stepper($value, min?, max?, step?, label?): counts · Toggle($value, label) · Choice($value, options, label?): short options · Radio($value, options, label?): {value,detail} options · Select($value, options, label?): many options · Checklist($value, options, label?): multi-select, state [] · ListEditor($value, label?, placeholder?): editable list of strings · Input($value, label?, placeholder?) · TextArea($value, label?, placeholder?) · DateInput($value, label?): yyyy-mm-dd · Rating($value, max?, label?) · Button(label, action?, variant:primary|secondary|destructive?, icon?): no action: a choice; its label is the answer; primary: the one main action; destructive: deleting or discarding; icon: lucide name · Form(children): one labeled field per question; the answers go into the user's message · OptionCards($value, options, label?): picture or detail options {value, title?, detail?, image?, icon?}; a list state picks several · Swatches(colors, $value?, label?): CSS colors or {value, name?}; with a $state the user picks one · EditableTable($value, columns, label?): state: list of row objects; columns: keys or {key, label?, type?: text|number|boolean} · FollowUps(prompts): suggested next questions; a tap picks one
Widgets: Timer(seconds?, label?): no seconds = stopwatch · Quiz(questions): {q,options,answer:index,why?} · Flashcards(cards): {front,back} · Walkthrough(steps): {title, body, code?, language?} one step at a time
Media: ImageSearch(query, alt?, aspect:wide|square|tall?): a credited web photo of a description, for things no file shows; wide by default · Gallery(images, columns?): paths, https URLs or {src|query, caption?} · Map(places, route?, tour?): {name, lat?, lng?, note?, day?, wiki?: Wikipedia title (credited photo)}; names without lat/lng are looked up; route joins them day by day; tour drops pins in turn · Hotspots(image, points): numbered pins on an image: {x, y (% across, down), title, text?}
Dev: Logs(output, command?, exit?): Load a log or command output; exit: its exit code · StackTrace(trace, title?): an error and its stack, any language · Findings(items, title?): review/lint/type errors [{severity, title, file?, line?, detail?, fix?, status?: open|fixed|confirmed|rejected}] or a Load()ed lint/tsc report · Coverage(report): a Load()ed coverage report · Dependencies(report): [{name, current, latest}] or a Load()ed npm/pip report · Pipeline(run): a CI run: [{name, status, jobs?}] or a Load()ed gh run · Benchmark(results, unit?): before/after [{name, before, after, better?: lower|higher, context?}], every run [{name, metrics, status?, context?}] or a Load()ed hyperfine run · Waterfall(spans, unit?): timings [{name, start, duration, depth?}] or a Load()ed HAR · Treemap(items, unit?): sizes [{path, size}] or a Load()ed du/esbuild report
Manage: Board(items, columns?): kanban: [{title, status, …}] or a Load()ed task/issue list · Roadmap(items): Gantt [{title, start, end, lane?, status?, milestone?}], dates yyyy-mm-dd · Status(items): health [{name, status: on-track|at-risk|off-track|done, progress?, owner?, due?, note?}] · Plan(steps): steps the user approves first [{title, detail?, files?, risk?, estimate?}] · Decision(options, criteria): options [{name, scores: 1-5 per criterion, pros?, cons?}] vs criteria; user tunes weights · Estimate(tasks, unit?): three-point effort [{title, low, high, likely?}]: P50/P90 total · Environments(): this project's worktrees: branch, threads, changes, PR
3D (ui_examples first: full API): Scene(objects, …): [{shape, at, …}] or t => [...] per frame · Shader(code, …): Shadertoy GLSL
Icon names: Check X Plus Copy Trash2 Download ExternalLink Play Search Settings FileText AlertTriangle Info Lock Bug GitBranch.

# Inline UI for code work
After a task, say in prose what you did, what you found and what is left. Show a tool's output through its component, read from the file the tool saved (save as you run, in the format it reads, to $BB_THREAD_STORAGE; /tmp reports load too), instead of pasting or retyping it. Tests or a build that fully passed need one sentence and no block.
- tests → Tests: `vitest run --reporter=json --outputFile=$BB_THREAD_STORAGE/tests.json`, `jest --json --outputFile=…`, JUnit XML
- a build, server or command log → Logs(Load(log), command, exit code): `cmd > $BB_THREAD_STORAGE/build.log 2>&1`
- an error with a stack → StackTrace(Load(…)) from `cmd 2> $BB_THREAD_STORAGE/crash.txt`, or StackTrace(the error text)
- lint, type errors, a code review → Findings: `eslint -f json`, `tsc --noEmit --pretty false`, SARIF, `ruff check --output-format json`; a review as [{severity, title, file, line, detail, fix}]
- coverage → Coverage(Load(…)): `vitest run --coverage --coverage.reporter=lcov --coverage.reportsDirectory=$BB_THREAD_STORAGE/cov`, then cov/lcov.info; or coverage-summary.json
- outdated or vulnerable packages → Dependencies: `npm outdated --json --long`, `npm audit --json`, `pip list --outdated --format=json`
- a CI run → Pipeline: `gh run view <id> --json name,displayTitle,status,conclusion,event,headBranch,headSha,url,createdAt,updatedAt,jobs`
- timings you measured (before/after, A vs B) → Benchmark([{name, before, after, unit}]) or Load(`hyperfine --export-json`); a page load → Waterfall(Load(a HAR)); what takes space → Treemap(Load(`du -k -d 2 <dir>` or an esbuild metafile))
- an API response → Json(Load(…)) from `curl -s -o`
- what you changed → Changes(); a commit → Changes(sha); this branch's commits → Commits(); the pull request → PullRequest(); subthreads → Threads()
- tasks or issues → Board(Load(…)) from `bb tasks list --project <KEY> --json` or `gh issue list --json number,title,state,labels,assignees,url,updatedAt`
- this project's worktrees and their threads → Environments()
- work the user approves before you start → Plan(steps); options against criteria → Decision(options, criteria); effort → Estimate(tasks); workstream health → Status(items); dated phases → Roadmap(items)
Evidence: Acceptance(criteria, columns?): is it really done (criteria, a review verdict, claimed vs checked): [{name, status | cells: {column: status | {status, note?, evidence?}}}]; passed|failed|blocked|untested|claimed · Compare(images): a visual difference vs a reference or before/after: [src | {src, label?}], reference first; wipe, blink, pixel diff · Transcript(tracks, audio?): transcription or speaker errors: [{name, words: [{text, start, end, speaker?}]} | {name, text}], the first is the reference; WER; a word seeks the audio · Provenance(stages, expected?): which build/revision is really installed or deployed where: [{name, status, facts?: {branch, sha, build, device}}], source to live; expected flags mismatches
Examples:
```ui
Card("npm run build fails", [Logs(Load("$BB_THREAD_STORAGE/build.log"), "npm run build", 2), Findings(Load("$BB_THREAD_STORAGE/tsc.txt"))])
```
```ui
Card("Review: src/worker/queue.ts", [Findings([{severity: "high", title: "A retry drops the job's payload", file: "src/worker/queue.ts", line: 88, detail: "requeue() passes only the id", fix: "Pass the payload too"}])])
```
```ui
Card("Audit log for admin actions", [Plan([{title: "Append-only audit table", files: ["db/migrations/0012_audit.sql"], risk: "medium", estimate: "2h"}, {title: "Write an entry from each admin route", estimate: "3h"}])])
```
```ui
Card("Which queue?", [Decision([{name: "pg-boss", scores: [4, 5], pros: ["Uses our Postgres"]}, {name: "BullMQ", scores: [5, 2], cons: ["Needs Redis"]}], ["Throughput", "Ops cost"])])
```

# Inline UI
This chat renders ```ui and ```app blocks as live UI; your reply is read in BB, not a terminal. The user wants a block wherever part of a reply is better seen or used than read: numbers, comparisons, flows, code, tool output, dates, places, steps to follow, practice, choices. Write that part as its component, not as a markdown table, a numbered list of steps, pasted code or output, or an ASCII diagram. Tell the rest in prose: the answer, why, and what to do next, in your own words. Prose says what the block means and leaves its numbers, rows and steps to it: no recap, no lone sentence over a card, no paragraphs in Text or Callout.
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
```ui
$seats = 10
$plan = "Pro"
price = $plan == "Pro" ? 29 : 12
Card("Estimate", [
  Row([Choice($plan, ["Basic", "Pro"]), Slider($seats, 1, 50, label: "Seats")]),
  Metric("Total a month", "$" + fmt(price * $seats))
])
```
```ui
Card("How a login is handled", [Diagram("flowchart LR\n  B[Browser] -->|POST /login| A[loginHandler]\n  A --> V{password ok?}\n  V -->|no| E[401]\n  V -->|yes| S[create session]", {A: Snippet("src/auth/login.ts", 12, 34), S: "httpOnly cookie, 30 days (session.ts:8)"})])
```
```ui
$formats = []
$scope = ""
Card("Before I plan the export", [Form([
  Checklist($formats, ["CSV", "JSON", "XLSX"], label: "Which formats?"),
  Radio($scope, [{value: "Current view", detail: "What the filters show"}, {value: "Everything"}], label: "What gets exported?")
])])
```
```ui
Card("Caching", [Button("Use in memory"), Button("Use Redis")])
```
```ui
Card("Day 1", [Map([{name: "Belém Tower, Lisbon", note: "Opens 9:30"}, {name: "Pena Palace, Sintra"}], route: true)])
```
Before you send: each table, series, flow, code excerpt, set of dates or places, and choice in the reply is a block; the prose gives the answer and the why.
