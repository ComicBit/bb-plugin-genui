// What a Form sends: one user message with a `label: value` line per field.
import type { ComponentName } from "./catalog";
import type { Binding, UiNode, Value } from "./types";

/** The inputs a Form collects, in any layout inside it. */
const FIELDS: Partial<Record<ComponentName, true>> = {
  Slider: true,
  Stepper: true,
  Toggle: true,
  Choice: true,
  Radio: true,
  Select: true,
  Checklist: true,
  ListEditor: true,
  Input: true,
  TextArea: true,
  DateInput: true,
  Rating: true,
  OptionCards: true,
  // Only a bound Swatches is a field; a palette has no value to send.
  Swatches: true,
};

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function isNode(value: Value): value is UiNode {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "node";
}

function isBinding(value: Value | undefined): value is Binding {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "binding";
}

/** A field value as message text; "" when empty. */
function answer(value: Value): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? NUMBER.format(value) : "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(answer).filter((item) => item !== "").join(", ");
  return JSON.stringify(value);
}

/** One `label: value` line per field, in document order, at any depth. */
function collect(value: Value, lines: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, lines);
    return;
  }
  if (!isNode(value)) return;
  const binding = value.props.value;
  if (value.type !== "Error" && value.type !== "Loading" && FIELDS[value.type] && isBinding(binding)) {
    const label = typeof value.props.label === "string" ? value.props.label.trim() : "";
    // An unrated Rating holds 0: no answer, not a zero.
    const given = value.type === "Rating" && binding.value === 0 ? null : binding.value;
    const name = label || binding.name;
    // A label that is a question or ends in a colon already reads as a prompt.
    lines.push(`${name}${/[?:]$/.test(name) ? "" : ":"} ${answer(given) || "—"}`);
    return;
  }
  for (const prop of Object.values(value.props)) collect(prop, lines);
}

/** The message a Form's submit sends: `label: value` per field inside it (label, else state name; lists joined; Yes/No; empty "—"). */
export function formMessage(form: UiNode): string {
  const lines: string[] = [];
  collect(form.props.children ?? null, lines);
  return lines.join("\n");
}
