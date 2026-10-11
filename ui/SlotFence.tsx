// Renderer for BB's experimental_codeFenceRenderer slot (proposed upstream on
// get-bb/bb branch feat/code-fence-renderer). BB hands over each ```ui and
// ```app fence of an assistant reply with the closing-fence state, so no DOM
// scraping or settle heuristic is needed. The props mirror that proposal;
// the published SDK does not declare them yet.
import type { ComponentType } from "react";
import type { PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { Fence, useThreadActions, type FenceLanguage } from "./Fence";

export interface CodeFenceRendererProps {
  code: string;
  language: string;
  complete: boolean;
  /** Zero-based position among this message's fences of the same language. */
  index: number;
  message: PluginMessageDirectiveProps["message"];
  Original: ComponentType;
}

export interface CodeFenceRendererRegistration {
  id: string;
  languages: readonly string[];
  component: ComponentType<CodeFenceRendererProps>;
}

export const FENCE_LANGUAGES: readonly FenceLanguage[] = ["ui", "app"];

export function SlotFence({ code, language, complete, index, message, Original }: CodeFenceRendererProps) {
  const actions = useThreadActions();
  if (language !== "ui" && language !== "app") return <Original />;
  return (
    <Fence
      language={language}
      code={code}
      complete={complete}
      stateKey={`bb.genui.state:${message.id}#${language}#${index}`}
      threadId={message.threadId}
      messageId={message.id}
      actions={actions}
    />
  );
}
