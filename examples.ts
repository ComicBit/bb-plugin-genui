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

/**
 * For components whose API is too big for the instructions: the whole of it,
 * adapted from Zeron's show_visual reference (crates/mcp/src/tools.rs), whose
 * ui.scene and ui.shader these match.
 */
const NOTES: Partial<Record<ComponentName, string>> = {
  Scene: `Real 3D, y up, drawn on the GPU with depth, soft shadows from a key light, and bloom; the camera frames your geometry and the reader drags to orbit (wheel or pinch zooms).
Scene(objects, height?: px = 320 (120–720), camera?: {yaw = 0.6, pitch = 0.45, zoom = 1}, orbit?: true, spin?: turntable radians per second = 0, animate?: true when objects is a function).
objects: a list of {shape, ...} records, or a function t => [...] (t in seconds) called every frame for motion; nested lists flatten and null/false drop out, so planets.map(...) and cond ? {...} : null work inside it. Unknown fields are errors.
- {shape: "box", at: [x, y, z], size: n | [w, h, d] = 1, rotate?: [x, y, z] degrees}
- {shape: "sphere", at, radius = 0.5, detail? = 18} · {shape: "cylinder", at (base centre), radius = 0.5, height = 1, detail? = 24}
- {shape: "surface", x: [min, max], z: [min, max], f: (x, z) => y or values: [[y, ...], ...] (rows along z), detail? = 32 (≤ 128), colors?: ["chart1", "chart3"] (a ramp by height), wire?: false}
- {shape: "mesh", vertices: [[x, y, z], ...], faces: [[i, j, k], ...] (0-based; polygons fan), uvs?: [[u, v], ...] per vertex}
- {shape: "line", from, to, color?, width? px} · {shape: "path", points: [[x, y, z], ...], color?, width?}
- {shape: "point", at, radius? px = 3, color?, hint?: "shown on hover"} · {shape: "label", at, text, color?, size?: xs|sm|body|lg}
- {shape: "grid", size? = 10, step? = 1, y? = 0} · {shape: "axes", size? = 1, labels?: ["x", "y", "z"]}
- {shape: "model", src: "chair.glb", at?, rotate?, scale? = 1, fit?: n (centre it, longest side n)}: a glTF (.glb or embedded .gltf) with its own materials and textures; material fields given here override them.
- {shape: "environment", src: "studio.hdr", intensity? = 1, background? = false}: lights the scene from an equirectangular image (HDR best, or PNG/JPG) that metal and glass reflect and glass bends; background: true also draws it behind.
- {shape: "sprite", at, size? = 48 px, color?, glow? = 1, src?: "flare.png"}: a camera-facing light (a soft round glow without src) that blooms.
Materials (box, sphere, cylinder, surface, mesh, model): color, roughness (0 mirror to 1 matte, 0.55), metal (0–1), glow (emits its colour and blooms: lamps, beams, highlights), glass: true (refracts what's behind it; ior = 1.5, dispersion 0–1 splits it into a rainbow, as a prism does), texture: "wood.jpg" (multiplied by color; a mesh needs uvs).
Colours are theme tokens: text, muted, faint, accent, good, warn, bad, info, border, chart1–chart6 (series in order); a material's physical colour may be "#rrggbb" (gold, glass, wood), only in 3D. Solids default to chart1, lines and labels to muted.
Files (models, environments, sprites, textures) are paths like Image's: workspace, $BB_THREAD_STORAGE or /tmp, up to 10 MB; find or make them with your tools first (download; convert KTX2 or EXR to PNG or HDR).
Style: build real forms from several primitives (legs, tops, rims), not single boxes, and give materials so surfaces read as wood, metal or glass. The scene sits on the chat: no backgrounds or floors to paint; a grid is optional. Math: sin cos tan asin acos atan atan2 sqrt clamp lerp range(a, b, step?) random(i) (the same every render) PI TAU. Up to 2,000 objects, 20,000 vertices per mesh, 2,000 path points.`,
  Shader: `GPU shaders for what geometry can't express: raymarched SDFs and fractals, light and optics (beams, refraction, dispersion), volumes, fluids, particles, generative art.
Shader(code, height? = 320, buffers?: [code, ...], inputs?: {speed: $speed}, textures?: ["rock.jpg"], blend?: light|alpha|opaque, bloom? = 0 (0–3), orbit?, spin?, camera?: {yaw, pitch, zoom}, animate? = true).
Write each pass as on Shadertoy, in a \`...\` template: void mainImage(out vec4 fragColor, in vec2 fragCoord) (GLSL ES 3.00), with iResolution (vec3: width and height in pixels, then the pixel density), iTime, iTimeDelta, iFrame, iMouse (pixels from the bottom-left; xy where the pointer is, zw where it went down while held, negative otherwise), iCamera (vec4 yaw, pitch, zoom, 0; orbit: true lets the reader drag it), every inputs name as a float (bind them to state, so sliders and toggles drive the shader; booleans are 0/1), iNoise (a tiling 256×256 random RGBA texture), iTexture0–3 (textures, repeating, mipmapped) and iChannel0–3 with iChannelResolution[4]: buffers run first, in order, each into a float texture that every pass reads as iChannel<i> (an earlier buffer's current frame; a buffer's own previous frame), for blur, trails, accumulation and simulation. A pass may only sample the channels and textures it has.
The shader sits on the chat, never in a box: don't paint a background, vignette or floor colour. By default (blend: "light") the output is emitted light: brightness is opacity and black is clear, right for beams, glows, sparks and light through glass. For solid shaded objects (fractals, SDF bodies) use blend: "alpha" and write alpha 0 where the ray misses. bloom 0.6–1.5 adds a soft glow around bright light.
The width varies with the reader (a phone is about 350px wide, often narrower than the shader is tall): scale by min(iResolution.x, iResolution.y), not one axis, and keep the subject centred with room on both sides. check_ui reports GLSL errors with the pass and line. Limits: 4 buffers, 4 textures, 16 inputs, 64 KiB per pass.`,
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
        ...(NOTES[component] === undefined ? [] : [NOTES[component]]),
        ...(described.length > 0 ? described : ["No example yet."]),
      ].join("\n"),
    );
  }
  return { ok, text: sections.join("\n\n") };
}
