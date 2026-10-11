// Worked examples for the ui_examples tool, taken from the gallery specs
// (gallery/<Component>.ui and gallery/<Component>-<variant>.ui). They are the
// specs the gallery page renders, so an example the tool returns is known to
// compile and draw.
import { collectLoads, compile } from "./core";
import { COMPONENTS, componentSignature, type ComponentName } from "./core/catalog";
import { listGallery, loadGalleryFile, readGallerySpec } from "./data-source";

/** Per example, how much of each file it Loads is shown. */
const DATA_PREVIEW_CHARS = 600;

/**
 * For components that read a tool's output: the commands that save it where
 * Load reads it. Gallery examples Load gallery files (`data/…`); in a thread
 * the file goes to $BB_THREAD_STORAGE.
 */
const SOURCES: Partial<Record<ComponentName, string>> = {
  Tests:
    'npx vitest run --reporter=json --outputFile=$BB_THREAD_STORAGE/vitest.json · npx jest --json --outputFile=$BB_THREAD_STORAGE/jest.json · pytest --junitxml=$BB_THREAD_STORAGE/junit.xml (any JUnit XML works)',
  Json: "curl -s -o $BB_THREAD_STORAGE/response.json <url> · <command> --json > $BB_THREAD_STORAGE/out.json",
  Logs: 'npm run build > $BB_THREAD_STORAGE/build.log 2>&1; echo $? (that exit code is the `exit` argument) · a server or JSON-lines log file as it is',
  StackTrace:
    "node app.mjs 2> $BB_THREAD_STORAGE/crash.txt (python3, go run, RUST_BACKTRACE=1 cargo run, java the same way) · or the error text as a string",
  Findings:
    "npx eslint -f json . > $BB_THREAD_STORAGE/eslint.json · npx tsc --noEmit --pretty false > $BB_THREAD_STORAGE/tsc.txt · ruff check --output-format json > $BB_THREAD_STORAGE/ruff.json · SARIF from semgrep --sarif, CodeQL and others · oxlint -f json, biome lint --reporter=json · or a review written as the list",
  Coverage:
    "npx vitest run --coverage --coverage.reporter=lcov --coverage.reportsDirectory=$BB_THREAD_STORAGE/coverage (needs @vitest/coverage-v8), then Load(\"$BB_THREAD_STORAGE/coverage/lcov.info\") · the json-summary reporter's coverage-summary.json · coverage json -o $BB_THREAD_STORAGE/coverage.json · go test -coverprofile=$BB_THREAD_STORAGE/coverage.out ./...",
  Dependencies:
    "npm outdated --json --long > $BB_THREAD_STORAGE/outdated.json || true · npm audit --json > $BB_THREAD_STORAGE/audit.json || true · both in one: Dependencies({outdated: Load(…), audit: Load(…)}) · pnpm outdated --format json · pip list --outdated --format=json",
  Pipeline:
    "gh run view <id> --json name,displayTitle,status,conclusion,event,headBranch,headSha,url,createdAt,updatedAt,jobs > $BB_THREAD_STORAGE/run.json · gh pr checks <n> --json name,state,bucket,link,startedAt,completedAt,workflow > $BB_THREAD_STORAGE/checks.json",
  Benchmark:
    "hyperfine --export-json $BB_THREAD_STORAGE/bench.json 'cmd a' 'cmd b' · vitest bench --run --outputJson $BB_THREAD_STORAGE/bench.json · or before/after numbers you measured, as the list",
  Waterfall:
    'a HAR: Playwright browser.newContext({recordHar: {path: "$BB_THREAD_STORAGE/page.har"}}), written when the context closes · a Chrome trace filtered to its slow events (jq \'{traceEvents: [.traceEvents[] | select(.ph == "X" and .dur > 1000)]}\') · or spans you timed, as the list',
  Treemap:
    "esbuild <entry> --bundle --metafile=$BB_THREAD_STORAGE/meta.json --outdir=/tmp/out · du -k -d 2 <dir> > $BB_THREAD_STORAGE/du.txt · or sizes as the list",
  Board:
    "bb tasks list --project <KEY> --json > $BB_THREAD_STORAGE/tasks.json · gh issue list --json number,title,state,labels,assignees,url,updatedAt > $BB_THREAD_STORAGE/issues.json · gh pr list --json number,title,state,isDraft,labels,assignees,author,url,updatedAt",
  Acceptance:
    "write {criteria: [{name, cells: {column: {status, note, evidence, by}}}]} to $BB_THREAD_STORAGE/acceptance.json as you check each criterion; a workflow gate's {matrix} or an owner's {complete, contract, blockers} loads as it is · evidence: file:line, a path, an https URL or an image",
  Transcript:
    "whisper-cli -m ggml-base.en.bin -f call.wav -ojf -of $BB_THREAD_STORAGE/hyp (whisper.cpp) · whisper --word_timestamps True --output_format json · an .srt or .vtt as {name, text: Load(…)} · the reference as {name: \"Reference\", text} or timed words; audio: wav, mp3, m4a, flac, ogg (25 MB)",
  Provenance:
    "append one stage per step to $BB_THREAD_STORAGE/trace.json as you go: {name, status, facts: {branch: git branch --show-current, sha: git rev-parse HEAD, build, device, url}, evidence: the log or receipt path}; pass what was asked for as expected",
};

export function isComponentName(name: string): name is ComponentName {
  return Object.hasOwn(COMPONENTS, name);
}

/** Gallery specs that show `component`, the plain one first. */
export function examplesOf(names: readonly string[], component: string): string[] {
  return names
    .filter((name) => name === `${component}.ui` || name.startsWith(`${component}-`))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

async function describe(name: string): Promise<string> {
  const source = (await readGallerySpec(name)).trimEnd();
  const parts = [`\`\`\`ui\n${source}\n\`\`\``];
  const program = compile(source).program;
  for (const request of program === null ? [] : collectLoads(program)) {
    const loaded = await loadGalleryFile(request.path, { raw: true });
    if (!loaded.ok || typeof loaded.value !== "string") continue;
    const text = loaded.value.trim();
    const shown = text.length > DATA_PREVIEW_CHARS ? `${text.slice(0, DATA_PREVIEW_CHARS)}…` : text;
    parts.push(`"${request.path}" in this example holds:\n${shown}`);
  }
  return parts.join("\n");
}

/** The tool's text: each requested component's signature and its examples. */
export async function examplesReport(components: readonly string[]): Promise<{ ok: boolean; text: string }> {
  const names = await listGallery();
  const sections: string[] = [];
  let ok = true;
  for (const component of components) {
    if (!isComponentName(component)) {
      ok = false;
      sections.push(`${component}: not a component.`);
      continue;
    }
    const examples = examplesOf(names, component).slice(0, 3);
    const described = await Promise.all(examples.map(describe));
    const source = SOURCES[component];
    sections.push(
      [
        `## ${componentSignature(component)}`,
        ...(source === undefined ? [] : [`Save the data with: ${source}`]),
        ...(described.length > 0 ? described : ["No example yet."]),
      ].join("\n"),
    );
  }
  return { ok, text: sections.join("\n\n") };
}
