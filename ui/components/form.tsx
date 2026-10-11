import { useState } from "react";
import { formMessage } from "../../core/form";
import { Button as BaseButton } from "@/components/ui/button";
import { RenderNodes } from "../render";
import { useUiRuntime } from "../runtime";
import { nodes, optionalText, type Props } from "../values";
import { SentLine } from "./inputs";

/**
 * Disabled fields keep their values legible: no UA graying (Safari dims
 * disabled text fields and fills their text gray) and no pointer cursor.
 */
const READ_ONLY =
  "[&_:disabled]:cursor-default [&_input:disabled]:opacity-100 [&_select:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_input:disabled]:[-webkit-text-fill-color:currentColor] [&_textarea:disabled]:[-webkit-text-fill-color:currentColor]";

/**
 * Fields stacked like a Stack, then one submit that sends every field as one
 * user message. Once this UI has sent its answer, or the thread moved on, the
 * fields stay visible read-only and the submit gives way to "Sent" (or to
 * nothing when the thread moved on without an answer).
 */
export function Form({ props }: { props: Props }) {
  const { run, answer, superseded } = useUiRuntime();
  const [sending, setSending] = useState(false);
  const message = formMessage({ kind: "node", type: "Form", key: "", props });
  const label = optionalText(props.submit)?.trim() || "Send";
  return (
    <fieldset
      disabled={sending || answer !== null || superseded}
      className={`m-0 flex min-w-0 flex-col gap-4 border-0 p-0 ${READ_ONLY}`}
    >
      <RenderNodes nodes={nodes(props.children)} />
      {answer !== null ? (
        <SentLine text={null} />
      ) : superseded ? null : (
        <BaseButton
          type="button"
          size="sm"
          disabled={sending || message === ""}
          aria-busy={sending || undefined}
          onClick={async () => {
            setSending(true);
            try {
              await run([{ kind: "action", type: "send", text: message }]);
            } finally {
              setSending(false);
            }
          }}
          className="w-fit max-w-full text-[13px]"
        >
          <span className="truncate">{label}</span>
        </BaseButton>
      )}
    </fieldset>
  );
}
