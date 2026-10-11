// Clickable Mermaid nodes. BB draws the diagram (code.tsx's Diagram); this
// layer finds the drawn nodes named in `details` by their mermaid id and
// turns them into buttons, and opens the selected node's detail under the
// diagram. The SVG belongs to BB's renderer and is replaced on every redraw
// (source toggle, theme change, streaming), so nodes are decorated with
// attributes only and re-found by a MutationObserver; events are delegated.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { RenderNodes } from "../render";
import { ACCENT } from "../values";
import { detailFor, mermaidNodeId, type DiagramDetail } from "./explain-logic";
import { FOCUS_RING } from "./inputs";
import { SMOOTH_HEIGHT_CLASS, useSmoothHeight } from "./motion";
import { sketchPalette, type SketchPalette } from "./sketch";

/** The attribute that marks a decorated node; its value is the detail key. */
const NODE_ATTR = "data-genui-node";
const SELECTED_ATTR = "data-genui-selected";

/** Shapes of a node (not its label's backing rect), so tints show behind the text. */
const SHAPES = `:is(rect,polygon,circle,ellipse,path):not(.label *)`;

/**
 * Hand-drawn nodes (sketch.ts) are rough.js paths: the hachure fill is a path
 * stroked in the fill colour, the outline a path stroked in ink. Tints go on
 * the hachure, emphasis on the outline, in Excalidraw's colours for the theme
 * the diagram was drawn in (BB marks its dark theme with `html.dark`).
 */
function roughNodeCss(theme: string, colors: SketchPalette): string {
  const node = `${theme} [${NODE_ATTR}].rough-node`;
  const outline = `path[stroke="${colors.ink}"]`;
  const fill = `path:not([stroke="${colors.ink}"])`;
  return `
${node} ${outline}{stroke:${colors.link}!important;stroke-width:2px!important;transition:stroke-width 150ms}
${node} ${fill}{transition:stroke 150ms}
${node}:hover ${fill}{stroke:${colors.hover}!important}
${node}[${SELECTED_ATTR}] ${fill}{stroke:${colors.selected}!important}
${node}[${SELECTED_ATTR}] ${outline}{stroke-width:3px!important}
${node}:focus-visible ${outline}{stroke-width:3.5px!important}`;
}

/**
 * Global, because BB's zoom view shows a copy of the SVG in a dialog outside
 * this component. Mermaid styles nodes by `#svg-id` selectors, so the
 * overrides need `!important`.
 */
const NODE_CSS = `
[${NODE_ATTR}]{cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
[${NODE_ATTR}]:not(.rough-node) ${SHAPES}{stroke:${ACCENT}!important;transition:fill 150ms,stroke-width 150ms}
[${NODE_ATTR}]:not(.rough-node):hover ${SHAPES}{fill:color-mix(in oklab,${ACCENT} 12%,var(--background))!important}
[${NODE_ATTR}]:not(.rough-node)[${SELECTED_ATTR}] ${SHAPES}{fill:color-mix(in oklab,${ACCENT} 22%,var(--background))!important;stroke-width:2px!important}
[${NODE_ATTR}]:not(.rough-node):focus-visible ${SHAPES}{stroke:var(--ring)!important;stroke-width:2.5px!important}
${roughNodeCss("html:not(.dark)", sketchPalette(false))}
${roughNodeCss("html.dark", sketchPalette(true))}
@media (prefers-reduced-motion:reduce){[${NODE_ATTR}] path,[${NODE_ATTR}] ${SHAPES}{transition:none}}
`;

/** Mermaid's SVG, not an icon: only diagrams carry a role description. */
const DIAGRAM_SVG = "svg[aria-roledescription]";

interface Candidate {
  readonly element: SVGGElement;
  readonly id: string | null;
  readonly label: string;
}

/** Every drawn thing a detail may name: nodes, subgraphs and sequence participants. */
function candidates(svg: SVGSVGElement): Candidate[] {
  const found: Candidate[] = [];
  for (const element of svg.querySelectorAll<SVGGElement>("g.node, g.rough-node, g.cluster")) {
    const cluster = element.classList.contains("cluster");
    const labelElement = cluster ? element.querySelector(".cluster-label") : element;
    found.push({
      element,
      id: mermaidNodeId(element.id, svg.id, cluster),
      label: labelElement?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    });
  }
  // Sequence diagrams draw each participant twice (top and bottom), named by its id.
  for (const rect of svg.querySelectorAll("rect.actor[name]")) {
    const group = rect.parentElement;
    if (group instanceof SVGGElement) {
      found.push({ element: group, id: rect.getAttribute("name"), label: group.textContent?.trim() ?? "" });
    }
  }
  return found;
}

interface Decoration {
  /** Detail key → the node's visible label, for every detail drawn. */
  readonly labels: Readonly<Record<string, string>>;
}

/** Marks the nodes that have a detail as buttons (and unmarks ones that lost theirs). Attributes only. */
function decorate(svg: SVGSVGElement, details: readonly DiagramDetail[], selected: string | null, panelId: string): Decoration {
  const labels: Record<string, string> = {};
  for (const { element, id, label } of candidates(svg)) {
    const detail = detailFor(details, id, label);
    if (detail === null) {
      if (element.hasAttribute(NODE_ATTR)) {
        for (const name of [NODE_ATTR, SELECTED_ATTR, "tabindex", "role", "aria-label", "aria-expanded", "aria-controls"]) {
          element.removeAttribute(name);
        }
      }
      continue;
    }
    labels[detail.key] ??= label || detail.key;
    element.setAttribute(NODE_ATTR, detail.key);
    element.setAttribute("tabindex", "0");
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", label || detail.key);
    element.setAttribute("aria-expanded", String(detail.key === selected));
    element.setAttribute("aria-controls", panelId);
    if (detail.key === selected) element.setAttribute(SELECTED_ATTR, "");
    else element.removeAttribute(SELECTED_ATTR);
  }
  // BB marks the drawing as one image, which would hide these buttons from screen readers.
  const frame = svg.parentElement;
  if (Object.keys(labels).length > 0 && frame?.getAttribute("role") === "img") frame.setAttribute("role", "group");
  return { labels };
}

/** The decorated node an event came from, inside `root`. */
function nodeKey(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest(`[${NODE_ATTR}]`)?.getAttribute(NODE_ATTR) ?? null;
}

/** How far a press may travel and still count as a tap (BB's zoom view pans on drag). */
const TAP_SLOP_PX = 6;
/** How long a click in the frame waits for BB's zoom view to show the diagram. */
const ZOOM_WAIT_MS = 4000;

function DetailBody({ detail }: { detail: DiagramDetail }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {detail.parts.map((part, index) =>
        typeof part === "string" ? (
          // Parts are positional; text and components alternate freely.
          <Markdown key={index} content={part} className="min-w-0 text-sm [&>:first-child]:mt-0 [&>:last-child]:mb-0" />
        ) : (
          <RenderNodes key={index} nodes={[part]} />
        ),
      )}
    </div>
  );
}

/**
 * The diagram (`children`, BB's markdown rendering of it) with its detail
 * panel. Rendered inside the Diagram's frame.
 */
export function DiagramDetails({ details, children }: { details: readonly DiagramDetail[]; children: ReactNode }) {
  const panelId = useId();
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { outer, inner } = useSmoothHeight<HTMLDivElement, HTMLDivElement>();
  const [selected, setSelected] = useState<string | null>(null);
  const [labels, setLabels] = useState<Readonly<Record<string, string>>>({});
  const [drawn, setDrawn] = useState(false);
  // Native listeners on the zoom copy read the latest values through refs.
  const latest = useRef({ details, selected });
  latest.current = { details, selected };
  const zoomCopies = useRef(new Set<SVGSVGElement>());

  const apply = () => {
    const root = host.current;
    if (root === null) return;
    const { details, selected } = latest.current;
    const svg = root.querySelector<SVGSVGElement>(DIAGRAM_SVG);
    setDrawn(svg !== null);
    if (svg === null) return;
    const next = decorate(svg, details, selected, panelId).labels;
    setLabels((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    for (const copy of zoomCopies.current) {
      if (copy.isConnected) decorate(copy, details, selected, panelId);
      else zoomCopies.current.delete(copy);
    }
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // BB swaps the SVG on every redraw; decorate each new one.
  useLayoutEffect(() => {
    const root = host.current;
    if (root === null) return;
    applyRef.current();
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applyRef.current());
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // A new selection or new details re-mark the nodes.
  useLayoutEffect(() => applyRef.current(), [selected, details]);

  const toggle = (key: string) => setSelected((current) => (current === key ? null : key));

  /**
   * BB's zoom button shows a copy of the SVG (same id) in a dialog. While it
   * is open its nodes work too: a tap selects, closes the dialog and brings
   * the detail into view.
   */
  const watchZoom = () => {
    const svgId = host.current?.querySelector(DIAGRAM_SVG)?.id;
    if (!svgId) return;
    const started = Date.now();
    let seen = false;
    const scan = () => {
      const copies = [...document.querySelectorAll<SVGSVGElement>(`svg[id="${CSS.escape(svgId)}"]`)].filter(
        (svg) => !host.current?.contains(svg),
      );
      for (const copy of copies) {
        if (zoomCopies.current.has(copy)) continue;
        zoomCopies.current.add(copy);
        seen = true;
        const { details, selected } = latest.current;
        decorate(copy, details, selected, panelId);
        listenToCopy(copy);
      }
      if ((seen && copies.length === 0) || (!seen && Date.now() - started > ZOOM_WAIT_MS)) observer.disconnect();
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
  };

  const listenToCopy = (copy: SVGSVGElement) => {
    const pick = (key: string) => {
      setSelected(key);
      // BB's dialog closes on Escape; the detail opens under the diagram.
      copy.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    };
    // The zoom view captures the pointer to pan, which retargets the click
    // away from the node: a tap is a press on a node released close by.
    copy.addEventListener(
      "pointerdown",
      (down) => {
        const key = nodeKey(down.target);
        if (key === null || !down.isPrimary) return;
        // One press, one answer: the release or cancel of this pointer ends it.
        const press = new AbortController();
        const options = { capture: true, signal: press.signal };
        window.addEventListener(
          "pointerup",
          (up) => {
            if (up.pointerId !== down.pointerId) return;
            press.abort();
            if (Math.hypot(up.clientX - down.clientX, up.clientY - down.clientY) <= TAP_SLOP_PX) pick(key);
          },
          options,
        );
        window.addEventListener("pointercancel", (cancel) => cancel.pointerId === down.pointerId && press.abort(), options);
      },
      { capture: true },
    );
    copy.addEventListener("keydown", (event) => {
      const key = nodeKey(event.target);
      if (key === null || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      pick(key);
    });
  };

  // Copies left behind by an unmounted diagram stop being decorated.
  useEffect(() => () => zoomCopies.current.clear(), []);

  const onClick = (event: MouseEvent) => {
    const key = nodeKey(event.target);
    if (key !== null) {
      toggle(key);
      return;
    }
    if ((event.target as Element).closest("button") !== null) watchZoom();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = nodeKey(event.target);
    if (key === null) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(key);
    } else if (event.key === "Escape" && selected !== null) {
      event.preventDefault();
      setSelected(null);
    }
  };

  const detail = details.find((candidate) => candidate.key === selected) ?? null;
  // Details naming nothing drawn stay reachable as chips (a typo'd id, a diagram type without ids).
  const unmatched = drawn ? details.filter((candidate) => !Object.hasOwn(labels, candidate.key)) : [];
  const title = detail === null ? "" : (labels[detail.key] ?? detail.key);

  return (
    <>
      <style href="genui-diagram-details" precedence="default">
        {NODE_CSS}
      </style>
      {/* Delegated: the nodes live in BB's SVG, which React does not render. */}
      <div ref={host} onClick={onClick} onKeyDown={onKeyDown} className="min-w-0">
        {children}
      </div>
      <div ref={outer} className={cn("min-w-0 border-t border-border", SMOOTH_HEIGHT_CLASS)}>
        <div ref={inner} className="flex min-w-0 flex-col">
          {unmatched.length === 0 ? null : (
            <div className="flex min-w-0 flex-wrap gap-1.5 pt-2.5">
              {unmatched.map((candidate) => (
                <button
                  key={candidate.key}
                  type="button"
                  aria-expanded={candidate.key === selected}
                  aria-controls={panelId}
                  onClick={() => toggle(candidate.key)}
                  className={cn(
                    "max-w-full cursor-pointer truncate rounded-full px-2.5 py-0.5 text-xs transition-colors duration-150",
                    FOCUS_RING,
                    candidate.key === selected
                      ? "bg-foreground text-background"
                      : "bg-surface-recessed text-muted-foreground hover:text-foreground",
                  )}
                >
                  {candidate.key}
                </button>
              ))}
            </div>
          )}
          <span aria-live="polite" className="sr-only">
            {detail === null ? "" : `Showing ${title}`}
          </span>
          <div ref={panel} id={panelId} role="region" aria-label={detail === null ? "Details" : title} className="min-w-0">
            {detail === null ? (
              <p className="m-0 pt-2.5 text-xs leading-5 text-muted-foreground">
                {drawn && unmatched.length < details.length
                  ? "Select a highlighted part to see its details."
                  : "Select a part to see its details."}
              </p>
            ) : (
              <div key={detail.key} className="flex min-w-0 flex-col gap-2 pt-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h4 className="m-0 min-w-0 text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
                    {title}
                  </h4>
                  <button
                    type="button"
                    aria-label={`Close ${title}`}
                    onClick={() => setSelected(null)}
                    className={cn(
                      "-my-0.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-state-hover hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <Icon name="X" aria-hidden className="size-3.5" />
                  </button>
                </div>
                <DetailBody detail={detail} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
