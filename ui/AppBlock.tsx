// The escape hatch for UIs the component catalog cannot express (games,
// simulations, custom visuals): the model writes a complete self-contained
// HTML document in an ```app fence and it runs in a sandboxed iframe with an
// opaque origin and no network, styled by BB's theme passed in as CSS variables.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Frame } from "./LiveUi";

const CARD = "rounded-xl border border-border bg-background p-4 sm:px-5";
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 1400;

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

/** App variable → host properties tried in order (first non-empty wins). */
const THEME_SOURCES: ReadonlyArray<readonly [string, ...string[]]> = [
  ["--background", "--background"],
  ["--foreground", "--foreground"],
  ["--muted", "--muted", "--surface-recessed"],
  ["--muted-foreground", "--muted-foreground"],
  ["--subtle-foreground", "--subtle-foreground", "--muted-foreground"],
  ["--border", "--border"],
  ["--card", "--card", "--background"],
  ["--primary", "--primary"],
  ["--primary-foreground", "--primary-foreground"],
  ["--success", "--success"],
  ["--warning", "--warning"],
  ["--warning-text", "--warning-text", "--warning"],
  ["--destructive", "--destructive"],
  ["--accent", "--color-timeline-accent", "--primary"],
  ["--font-sans", "--font-sans", "font-family"],
  ["--font-mono", "--font-mono"],
  ["color-scheme", "color-scheme"],
];

const BASE_STYLES = `*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent}
html{color:var(--foreground);font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
code,kbd,pre,samp{font-family:var(--font-mono,ui-monospace,monospace)}
img,video,canvas{max-width:100%}
button,input,select,textarea{font:inherit;color:inherit;margin:0}
button{cursor:pointer;padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--background);line-height:1.25}
button:hover{background:var(--muted)}
button:disabled{opacity:.5;cursor:default}
input,select,textarea{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--background)}
input[type=range],input[type=checkbox],input[type=radio],progress{accent-color:var(--accent);padding:0}
input[type=range]{border:0;background:transparent}
::placeholder{color:var(--subtle-foreground)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`;

/**
 * Runs before the model's HTML. Posts the document height (load, resize) and
 * runtime errors to the host, and applies theme updates from it. `host` is
 * captured first because a top-level `var parent` in app code replaces it.
 */
const BOOTSTRAP = `(function(){
var host=window.parent,last=-1;
function post(message){message.source="genui-app";host.postMessage(message,"*");}
function measure(){
var body=document.body,height=Math.ceil(Math.max(document.documentElement.getBoundingClientRect().height,body?body.scrollHeight:0));
if(height!==last){last=height;post({type:"height",height:height});}
}
var observer=new ResizeObserver(measure);
observer.observe(document.documentElement);
document.addEventListener("DOMContentLoaded",function(){if(document.body)observer.observe(document.body);measure();});
addEventListener("load",measure);
addEventListener("error",function(event){post({type:"error",message:String(event.message||"Script error")});});
addEventListener("unhandledrejection",function(event){var reason=event.reason;post({type:"error",message:"Unhandled rejection: "+String(reason&&reason.message||reason)});});
addEventListener("securitypolicyviolation",function(event){post({type:"error",message:"Blocked by the sandbox (no network access): "+(event.blockedURI||event.effectiveDirective)});});
addEventListener("message",function(event){
var data=event.data;
if(event.source!==host||!data||data.source!=="genui-host"||data.type!=="theme"||typeof data.css!=="string")return;
document.getElementById("genui-theme").textContent=data.css;
});
})();`;

export type AppTheme = Readonly<Record<string, string>>;

export type AppMessage =
  | { readonly type: "height"; readonly height: number }
  | { readonly type: "error"; readonly message: string };

/** Values that could close the theme `<style>` element or add rules are dropped. */
const UNSAFE_CSS_VALUE = /[<>{};\\]/;

/** The app's theme variables from host computed-style lookups (`read` returns "" when unset). */
export function resolveTheme(read: (property: string) => string): AppTheme {
  const theme: Record<string, string> = {};
  for (const [name, ...sources] of THEME_SOURCES) {
    const value = sources.map((source) => read(source).trim()).find((candidate) => candidate !== "");
    if (value !== undefined && !UNSAFE_CSS_VALUE.test(value)) theme[name] = value;
  }
  return theme;
}

export function themeCss(theme: AppTheme): string {
  return `:root{${Object.entries(theme)
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;
}

/** CSP, base styles, theme and bootstrap, then the model's document as written. */
export function buildSrcdoc(html: string, theme: AppTheme): string {
  // Our doctype keeps standards mode; the parser then ignores the model's
  // doctype/<head> tags and merges its <html> attributes.
  return [
    "<!doctype html>",
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<style>${BASE_STYLES}</style>`,
    `<style id="genui-theme">${themeCss(theme)}</style>`,
    `<script>${BOOTSTRAP}</script>`,
    html,
  ].join("\n");
}

/** Accepts only `{ source: "genui-app", type, height | message }` with no extra keys. */
export function parseAppMessage(data: unknown): AppMessage | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (record.source !== "genui-app" || Object.keys(record).length !== 3) return null;
  if (record.type === "height") {
    const { height } = record;
    return typeof height === "number" && Number.isFinite(height) && height >= 0 ? { type: "height", height } : null;
  }
  if (record.type === "error") {
    const { message } = record;
    return typeof message === "string" ? { type: "error", message: message.slice(0, 500) } : null;
  }
  return null;
}

function readHostTheme(): AppTheme {
  const style = getComputedStyle(document.documentElement);
  return resolveTheme((property) => style.getPropertyValue(property));
}

export function AppBlock({ html, ready }: { html: string; ready: boolean }) {
  return (
    <Frame source={html} language="html" diagnostics={[]}>
      {ready ? (
        // Keyed so a changed document starts with a fresh height and no stale error.
        <AppFrame key={html} html={html} />
      ) : (
        <div className={CARD} role="status">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-[var(--color-timeline-accent,var(--primary))]" />
            Building app…
          </div>
        </div>
      )}
    </Frame>
  );
}

/**
 * Each app's last reported height. BB's timeline remounts rows as the user
 * scrolls back; a remounted app opens at the height it had instead of growing
 * from the minimum once its document reports in. Bounded.
 */
const APP_HEIGHTS = new Map<string, number>();
const MAX_APP_HEIGHTS = 50;

function AppFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sentCss = useRef("");
  const [height, setHeight] = useState(() => APP_HEIGHTS.get(html) ?? MIN_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  const srcdoc = useMemo(() => buildSrcdoc(html, readHostTheme()), [html]);

  // A layout effect so the listener exists before the srcdoc document runs.
  useLayoutEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (frame === null || event.source !== frame.contentWindow) return;
      const message = parseAppMessage(event.data);
      if (message === null) return;
      if (message.type === "height") {
        const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(message.height)));
        APP_HEIGHTS.delete(html);
        APP_HEIGHTS.set(html, next);
        if (APP_HEIGHTS.size > MAX_APP_HEIGHTS) APP_HEIGHTS.delete(APP_HEIGHTS.keys().next().value!);
        setHeight(next);
      } else {
        setError(message.message);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html]);

  // Stable: reads only refs, so the observers below subscribe once.
  const postTheme = useCallback((force: boolean) => {
    const css = themeCss(readHostTheme());
    if (!force && css === sentCss.current) return;
    sentCss.current = css;
    iframeRef.current?.contentWindow?.postMessage({ source: "genui-host", type: "theme", css }, "*");
  }, []);

  useEffect(() => {
    const onThemeChange = () => postTheme(false);
    const observer = new MutationObserver((records) => {
      const themeAttribute = records.some(
        ({ attributeName }) =>
          attributeName === "class" || attributeName === "style" || attributeName?.startsWith("data-"),
      );
      if (themeAttribute) onThemeChange();
    });
    observer.observe(document.documentElement, { attributes: true });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", onThemeChange);
    return () => {
      observer.disconnect();
      scheme.removeEventListener("change", onThemeChange);
    };
  }, [postTheme]);

  return (
    <div className={CARD}>
      <iframe
        ref={iframeRef}
        title="App"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcdoc}
        // A theme change during loading reached the previous document: re-sync.
        onLoad={() => postTheme(true)}
        className="block w-full border-0"
        style={{ height }}
      />
      {error === null ? null : (
        <p className="mt-2 truncate text-xs text-destructive/80" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
