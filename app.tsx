// bb-plugin-genui frontend. Agents write ```ui and ```app blocks in their
// replies. On a BB with the code-fence renderer slot, BB hands those fences to
// SlotFence; on older BB, an app overlay finds and replaces them in the DOM.
// The `::ui{id="…"}` directive keeps UIs stored by the show_ui pilot rendering.
// The Gen-UI Gallery page renders the example specs in gallery/.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app are provided by the BB app at load time (never
// bundled), so this file must be loaded by BB, not imported directly.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FenceOverlay } from "./ui/FenceOverlay";
import { FENCE_LANGUAGES, SlotFence, type CodeFenceRendererRegistration } from "./ui/SlotFence";
import { GalleryPanel } from "./ui/GalleryPanel";
import { UiDirective } from "./ui/UiDirective";

export default definePluginApp((app) => {
  // SDK 0.6.40 declares this slot but is not published yet. Older BB uses the overlay.
  const slots: typeof app.slots & {
    experimental_codeFenceRenderer?: (registration: CodeFenceRendererRegistration) => void;
  } = app.slots;
  if (typeof slots.experimental_codeFenceRenderer === "function") {
    slots.experimental_codeFenceRenderer({ id: "genui", languages: FENCE_LANGUAGES, component: SlotFence });
  } else {
    app.slots.experimental_appOverlay({ id: "ui-fences", component: FenceOverlay });
  }
  app.slots.messageDirective({ id: "ui", component: UiDirective });
  app.slots.navPanel({ id: "gallery", title: "Gen-UI Gallery", icon: "GridView", path: "gallery", component: GalleryPanel });
});
