import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import type { Action, UiNode, Value } from "../../core/types";
import { Button as BaseButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { resolveIconName } from "../icons";
import { CardDepthContext, useUiRuntime } from "../runtime";
import {
  finiteNumber,
  formatNumber,
  isAction,
  isBinding,
  isScalar,
  list,
  optionalText,
  text,
  type Props,
} from "../values";
import { CheckMark, ErrorLine } from "./display";
// fields.tsx imports this module's field styles; Radio is only used at render time, so the cycle is safe.
import { Radio } from "./fields";
import { useEntrance, type Entrance } from "./motion";

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Text field and dropdown share one compact field shape. */
export const FIELD = cn(
  "h-8 w-full min-w-0 rounded-md border border-border bg-background text-[13px] text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow duration-150",
  FOCUS_RING,
);

/** The small caption above a control. */
export const CAPTION = "text-xs leading-5 text-muted-foreground";

/** One thumb style for both engines: a white knob with a hairline and a soft drop. */
const THUMB =
  "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgb(0_0_0/0.18)] [&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-[0_1px_3px_rgb(0_0_0/0.18)]";

export function Slider({ props }: { props: Props }) {
  const { setValue } = useUiRuntime();
  const id = useId();
  const binding = props.value;
  if (!isBinding(binding)) return <ErrorLine message="Slider needs a $state binding" />;
  const min = finiteNumber(props.min) ?? 0;
  const max = Math.max(min, finiteNumber(props.max) ?? 100);
  // Integer bounds step by 1; fractional ranges get 100 stops.
  const step =
    finiteNumber(props.step) ??
    (Number.isInteger(min) && Number.isInteger(max) ? 1 : (max - min) / 100);
  const current = finiteNumber(binding.value) ?? min;
  const label = optionalText(props.label);
  const fill = max === min ? 0 : ((Math.min(max, Math.max(min, current)) - min) / (max - min)) * 100;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex h-5 items-center justify-between gap-3 text-xs">
        <label htmlFor={id} className="truncate text-muted-foreground">
          {label}
        </label>
        <span className="text-sm font-semibold leading-5 tabular-nums text-foreground">
          {formatNumber(current)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        aria-label={label === null ? binding.name : undefined}
        onChange={(event) => setValue(binding.name, Number(event.currentTarget.value))}
        // The filled part of the track shows the value at a glance.
        style={{
          background: `linear-gradient(to right, var(--primary) ${fill}%, var(--muted) ${fill}%)`,
        }}
        className={cn(
          "my-1 h-1 w-full cursor-pointer appearance-none rounded-full",
          THUMB,
          "focus-visible:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring/30",
        )}
      />
    </div>
  );
}

export function Toggle({ props }: { props: Props }) {
  const { setValue } = useUiRuntime();
  const binding = props.value;
  if (!isBinding(binding)) return <ErrorLine message="Toggle needs a $state binding" />;
  const on = Boolean(binding.value);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setValue(binding.name, !on)}
      className="group/switch inline-flex w-fit max-w-full cursor-pointer items-center gap-2 self-start text-sm text-foreground focus-visible:outline-none"
    >
      <span
        className={cn(
          "inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 group-focus-visible/switch:ring-1 group-focus-visible/switch:ring-ring",
          on ? "border-transparent bg-primary" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-card shadow-sm transition-transform duration-150 motion-reduce:transition-none",
            on ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="min-w-0 truncate">{text(props.label)}</span>
    </button>
  );
}

/** Segments fit a few short labels; long or many options read better as Radio's vertical list. */
const SEGMENT_MAX_OPTIONS = 5;
const SEGMENT_MAX_LABEL = 24;
const SEGMENT_MAX_TOTAL = 60;

export function Choice({ props }: { props: Props }) {
  const { setValue } = useUiRuntime();
  const labelId = useId();
  const binding = props.value;
  if (!isBinding(binding)) return <ErrorLine message="Choice needs a $state binding" />;
  const options = list(props.options);
  const labels = options.map((option) => (isScalar(option) ? String(option) : null));
  const fits =
    options.length <= SEGMENT_MAX_OPTIONS &&
    labels.every((text) => text !== null && text.length <= SEGMENT_MAX_LABEL) &&
    labels.join("").length <= SEGMENT_MAX_TOTAL;
  if (!fits) return <Radio props={props} />;
  const label = optionalText(props.label);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label === null ? null : (
        <span id={labelId} className="text-xs leading-5 text-muted-foreground">
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label === null ? undefined : labelId}
        className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg bg-surface-recessed p-0.5"
      >
        {options
          .filter(isScalar)
          .map((option, index) => {
            const selected = option === binding.value;
            return (
              <button
                // Options are positional; the same value may repeat.
                key={index}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setValue(binding.name, option)}
                className={cn(
                  "h-7 cursor-pointer rounded-md px-3 text-[13px] transition-[color,background-color,box-shadow] duration-150",
                  FOCUS_RING,
                  selected
                    ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === null ? "None" : String(option)}
              </button>
            );
          })}
      </div>
    </div>
  );
}

export function Input({ props }: { props: Props }) {
  const { setValue } = useUiRuntime();
  const id = useId();
  const binding = props.value;
  if (!isBinding(binding)) return <ErrorLine message="Input needs a $state binding" />;
  const label = optionalText(props.label);
  const placeholder = optionalText(props.placeholder);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label === null ? null : (
        <label htmlFor={id} className={CAPTION}>
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        value={text(binding.value)}
        placeholder={placeholder ?? undefined}
        aria-label={label === null ? (placeholder ?? binding.name) : undefined}
        onChange={(event) => setValue(binding.name, event.currentTarget.value)}
        className={cn(FIELD, "px-2.5 placeholder:text-subtle-foreground")}
      />
    </div>
  );
}

/** A native dropdown dressed as a field; option values are positions, so any scalar round-trips. */
export function Select({ props }: { props: Props }) {
  const { setValue } = useUiRuntime();
  const id = useId();
  const binding = props.value;
  if (!isBinding(binding)) return <ErrorLine message="Select needs a $state binding" />;
  const label = optionalText(props.label);
  const options = list(props.options).filter(isScalar);
  const selected = options.findIndex((option) => option === binding.value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label === null ? null : (
        <label htmlFor={id} className={CAPTION}>
          {label}
        </label>
      )}
      <div className="relative min-w-0">
        <select
          id={id}
          value={selected < 0 ? "" : String(selected)}
          aria-label={label === null ? binding.name : undefined}
          onChange={(event) => setValue(binding.name, options[Number(event.currentTarget.value)] ?? null)}
          className={cn(FIELD, "cursor-pointer appearance-none truncate pl-2.5 pr-8", selected < 0 && "text-muted-foreground")}
        >
          {selected < 0 ? (
            <option value="" disabled>
              Choose…
            </option>
          ) : null}
          {options.map((option, index) => (
            // Options are positional; the same value may repeat.
            <option key={index} value={index}>
              {option === null ? "None" : String(option)}
            </option>
          ))}
        </select>
        <Icon
          name="ChevronDown"
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}

/** Checkboxes over a list state: ticking adds the option (in option order), unticking removes it. */
export function Checklist({ props }: { props: Props }) {
  const { setValue } = useUiRuntime();
  const labelId = useId();
  const binding = props.value;
  if (!isBinding(binding)) return <ErrorLine message="Checklist needs a $state binding" />;
  const label = optionalText(props.label);
  const options = list(props.options).filter(isScalar);
  const picked = list(binding.value);
  const toggle = (option: Value) =>
    setValue(
      binding.name,
      picked.includes(option)
        ? picked.filter((value) => value !== option)
        : [
            ...options.filter((candidate) => candidate === option || picked.includes(candidate)),
            // Values the spec preset that are not options stay, after the options.
            ...picked.filter((value) => !options.some((candidate) => candidate === value)),
          ],
    );
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label === null ? null : (
        <span id={labelId} className={CAPTION}>
          {label}
        </span>
      )}
      <div
        role="group"
        aria-labelledby={label === null ? undefined : labelId}
        className="-mx-1.5 flex min-w-0 flex-col"
      >
        {options.map((option, index) => {
          const checked = picked.includes(option);
          return (
            <button
              // Options are positional; the same value may repeat.
              key={index}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(option)}
              className={cn(
                "flex w-fit max-w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm leading-5 text-foreground transition-colors duration-150 hover:bg-surface-recessed",
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
                  checked ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background",
                )}
              >
                {checked ? <CheckMark className="size-3" /> : null}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{option === null ? "None" : String(option)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** True inside a ButtonGroup, which handles the answered and superseded states for its buttons. */
const ButtonGroupContext = createContext(false);

/**
 * A Button wherever it appears: inside a ButtonGroup it is a plain button;
 * anywhere else (a Row cell, a Table cell, a Grid tile) it is a group of one,
 * so a choice button still folds away once answered.
 */
export function Button({ props }: { props: Props }) {
  const grouped = useContext(ButtonGroupContext);
  if (grouped) return <ButtonView props={props} />;
  return <ButtonGroup buttons={[{ key: "self", props, element: <ButtonView props={props} /> }]} />;
}

function ButtonView({ props }: { props: Props }) {
  const { run } = useUiRuntime();
  // Inside a nested tile, buttons sit on a tinted surface beside siblings that
  // carry the same action: a filled button per tile is too loud.
  const nested = useContext(CardDepthContext) > 1;
  const [running, setRunning] = useState(false);
  const label = text(props.label);
  // A button without an action is a reply choice: it sends its own label.
  const actions: readonly Action[] =
    props.action === undefined
      ? [{ kind: "action", type: "send", text: label }]
      : list(props.action).filter(isAction);
  const filled = props.variant === "primary" && !nested;
  const destructive = props.variant === "destructive";
  // An unknown name draws nothing; links and copies get their glyph by default.
  const icon =
    props.icon !== undefined
      ? resolveIconName(text(props.icon))
      : actions.some((action) => action.type === "openUrl")
        ? "ExternalLink"
        : actions.some((action) => action.type === "copy")
          ? "Copy"
          : null;
  return (
    <BaseButton
      type="button"
      size="sm"
      variant={filled ? "default" : "outline"}
      disabled={running || actions.length === 0}
      aria-busy={running || undefined}
      onClick={async () => {
        setRunning(true);
        try {
          await run(actions);
        } finally {
          setRunning(false);
        }
      }}
      className={cn(
        "w-fit max-w-full gap-1.5 text-[13px]",
        !filled && "bg-background text-foreground",
        destructive &&
          "border-destructive/40 text-destructive hover:bg-destructive/8 hover:text-destructive focus-visible:ring-destructive/60",
      )}
    >
      {icon === null ? null : <Icon name={icon} aria-hidden className="size-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </BaseButton>
  );
}

/** A quiet confirmation of what this UI sent; `text` null reads just "Sent". */
export function SentLine({ text }: { text: string | null }) {
  const ref = useEntrance<HTMLParagraphElement>(SENT_ENTRANCE);
  return (
    <p
      ref={ref}
      role="status"
      title={text ?? undefined}
      className="m-0 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted-foreground"
    >
      <Icon name="Check" aria-hidden className="size-3.5 shrink-0" />
      {text === null ? (
        "Sent"
      ) : (
        <>
          <span className="sr-only">You sent: </span>
          <span className="min-w-0 truncate">{text}</span>
        </>
      )}
    </p>
  );
}

const SENT_ENTRANCE: Entrance = { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 240 };

/** How long answered choices fade before they leave the layout. */
const CHOICE_FADE_MS = 200;

/**
 * Whether this UI's choices are closed (it sent an answer, or the thread moved
 * on) and, once their fade has run, gone. Choices closed before they mounted
 * are gone at once; ones closed on screen fade first.
 */
export function useClosedChoices(): { closed: boolean; gone: boolean } {
  const { answer, superseded } = useUiRuntime();
  const closed = answer !== null || superseded;
  const [gone, setGone] = useState(closed);
  useEffect(() => {
    if (!closed) {
      setGone(false);
      return;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setGone(true), reduced ? 0 : CHOICE_FADE_MS);
    return () => clearTimeout(timer);
  }, [closed]);
  return { closed, gone };
}

export interface GroupedButton {
  readonly key: string;
  readonly props: Props;
  /** The rendered Button, as its parent wraps it. */
  readonly element: ReactNode;
}

/** The text a button sends: its Send action's text, or its own label when it has no action. */
function sentTexts(props: Props): string[] {
  if (props.action === undefined) return [text(props.label)];
  return list(props.action).flatMap((action) => (isAction(action) && action.type === "send" ? [action.text] : []));
}

/**
 * A run of consecutive Buttons: one wrapping row. Choice buttons (Send, or no
 * action) are the reply's question: once this UI sent an answer they fold
 * into one line showing it, and once the thread moved on without one they
 * leave. Other buttons (links, copies, local state) stay.
 */
export function ButtonGroup({ buttons }: { buttons: readonly GroupedButton[] }) {
  const { answer } = useUiRuntime();
  const { closed, gone } = useClosedChoices();
  const choice = buttons.map(({ props }) => props.action === undefined || sentTexts(props).length > 0);
  // The sent line shows once, beside the button that sent it; other choice
  // runs (and a Form's answer) just fold away.
  const sentHere = answer !== null && buttons.some(({ props }) => sentTexts(props).includes(answer));
  const sent = sentHere && gone;
  const shown = choice.some((isChoice) => !(isChoice && gone));
  if (!sent && !shown) return null;
  return (
    <ButtonGroupContext value={true}>
      <div data-button-group="" className="flex min-w-0 flex-col gap-2">
        {sent ? <SentLine text={answer} /> : null}
        {shown ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {buttons.map((button, index) => {
              const leaving = choice[index] && closed;
              if (leaving && gone) return null;
              return (
                <div
                  key={button.key}
                  inert={leaving}
                  className={cn(
                    "flex min-w-0 max-w-full transition-opacity duration-200 ease-out motion-reduce:transition-none",
                    leaving && "opacity-0",
                  )}
                >
                  {button.element}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </ButtonGroupContext>
  );
}
