// Renderer for BB's merged experimental_codeFenceRenderer slot (#5387).
// The local contract mirrors SDK 0.6.40 until a version declaring the slot is
// published on npm; the installed 0.6.15 SDK does not declare it.
import type { ComponentType } from "react";
import type { PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { Fence, useThreadActions, type FenceLanguage } from "./Fence";

export interface CodeFenceRendererProps {
  code: string;
  language: string;
  status: "streaming" | "closed" | "unclosed";
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

export function SlotFence({ code, language, status, index, message, Original }: CodeFenceRendererProps) {
  const actions = useThreadActions();
  if (language !== "ui" && language !== "app") return <Original />;
  // Interrupted HTML remains source: never execute a document without its closing fence.
  if (language === "app" && status === "unclosed") return <Original />;
  return (
    <div data-genui-fence="" data-genui-renderer="slot">
      <Fence
        language={language}
        code={code}
        complete={status !== "streaming"}
        stateKey={`bb.genui.state:${message.id}#${language}#${index}`}
        threadId={message.threadId}
        messageId={message.id}
        actions={actions}
      />
    </div>
  );
}
