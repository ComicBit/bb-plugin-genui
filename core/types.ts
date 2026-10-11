// Shared contract between the language core (core/), the React renderer (ui/),
// and the server tool (server.ts). Pure data: no React, no DOM, no Node APIs.

import type { ComponentName } from "./catalog";

/** A compile-time or evaluation-time problem, positioned in the UI source. */
export interface Diagnostic {
  severity: "error" | "warning";
  /** 1-based line in the UI source. */
  line: number;
  /** 1-based column in the UI source. */
  column: number;
  message: string;
}

export type Scalar = string | number | boolean | null;

/**
 * Every value the renderer can receive as a component prop. Lambdas never
 * reach the renderer: they only exist while evaluating `map`/`filter`.
 */
export type Value =
  | Scalar
  | readonly Value[]
  | { readonly [key: string]: Value }
  | UiNode
  | Action
  | Binding;

/**
 * One evaluated component instance. `props` are keyed by the catalog param
 * name; omitted optional params are absent (never `undefined` values).
 * `nodes` params arrive normalized as `UiNode[]`, `actions` params as
 * `Action[]`, and `binding` params as a `Binding`.
 */
export interface UiNode {
  readonly kind: "node";
  /** A catalog component; `"Error"` when this node failed to evaluate; `"Loading"` while a file it reads with Load is still being read. */
  readonly type: ComponentName | "Error" | "Loading";
  /**
   * Stable across re-evaluations of the same program so React keeps
   * component identity: derived from the source position and list index.
   */
  readonly key: string;
  /** For `type: "Error"`: `{ message: string }`; for `"Loading"`: `{ path: string, component: ComponentName | null }` (null for a bare expression). */
  readonly props: Readonly<Record<string, Value>>;
}

/** A two-way binding to one `$state` variable. `name` excludes the `$`. */
export interface Binding {
  readonly kind: "binding";
  readonly name: string;
  readonly value: Value;
}

/** Side effects a button can trigger. Evaluated at render time. */
export type Action =
  | { readonly kind: "action"; readonly type: "send"; readonly text: string }
  | {
      readonly kind: "action";
      readonly type: "set";
      /** State name without the `$`. */
      readonly name: string;
      readonly value: Value;
    }
  | { readonly kind: "action"; readonly type: "openUrl"; readonly url: string }
  | { readonly kind: "action"; readonly type: "copy"; readonly text: string };

/** Mutable state of one rendered UI: `$name` → value (keys exclude the `$`). */
export type UiState = Readonly<Record<string, Value>>;
