# Changelog

What changed in each version of the Generative UI plugin for BB. Update an install with `bb plugin update genui`; agent sessions started after the update get new components and instructions.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.2.4] - 2026-10-21

### Added
- This changelog.

## [0.2.3] - 2026-10-20

### Fixed
- A zoomed picture or diagram can be dragged in every direction in the full-screen viewer. Along a side where it was still smaller than the screen (a wide diagram zoomed on a phone, or any diagram zoomed a little on a large screen), it was kept centred and the drag was ignored. Zoomed back out to fit, it is centred again. Compare uses the same geometry.

## [0.2.2] - 2026-10-20

### Fixed
- Diagrams pan after a pinch on touch screens. BB's mobile sidebar and side-panel swipes took the gesture: the outer finger of a pinch, or a sideways drag, slid a panel over the thread. Every surface you drag or pinch now opts out of BB's swipes: diagrams, the full-screen viewer, Compare, Map, and Scenes and Shaders you can orbit.
- A zoomed diagram keeps its zoom when BB redraws the message.

## [0.2.1] - 2026-10-20

Not released separately on GitHub; included in 0.2.2.

### Added
- One full-screen viewer for every picture a component shows (Image, Gallery, ImageSearch, Entity, Hotspots, OptionCards, Compare, Acceptance and Provenance evidence): zoom with the wheel, a trackpad pinch, two fingers or a double tap; drag to pan; step through a component's pictures; close with Escape, the close button or a tap beside the picture. Where tapping a picture already does something, an expand button opens it.
- Diagrams pinch-zoom (or ⌘/Ctrl + scroll) in place, and open full screen in the plugin's own viewer, which zooms and pans on iOS too.
- The README carousel shows the 3D components moving.

### Fixed
- Some images couldn't be opened at all (an Image only opened for workspace files, and Entity, Hotspots, OptionCards and Provenance pictures never did), and none could be zoomed.
- Tapping a diagram node that has details in full screen opens its detail inside the full-screen view instead of closing it.
- Fallback widgets open links in BB's in-app browser with the right thread context ([#6](https://github.com/ComicBit/bb-plugin-genui/pull/6)).

## [0.2.0] - 2026-10-20

### Added
- **3D**, after [Zeron](https://github.com/zeronsh/zeron)'s `ui.scene` and `ui.shader`:
  - `Scene` (three.js): solids, surfaces, meshes, lines, paths, points with hover hints, labels, grids, axes, glTF models, HDR environments and sprites; materials with roughness, metal, glow with bloom, and glass with refraction and dispersion; soft shadows; drag to orbit, pinch or ⌘/Ctrl + scroll to zoom. `t => [...]` animates it frame by frame.
  - `Shader`: Shadertoy-style GLSL passes with feedback buffers, `iMouse`, an orbitable `iCamera`, `inputs` bound to state, textures and `iNoise`; `light`, `alpha` and `opaque` blends and bloom.
  - At most six WebGL contexts at once; the others show their last frame at the same size.
  - Math functions: `sin cos tan asin acos atan atan2 sqrt floor ceil clamp lerp range random`, `PI` and `TAU`.
  - Eight gallery examples.
- `check_ui` tries a block's inputs the way a reader would (slider and stepper ends, toggles, every option, emptied and filled lists, cleared text, Set buttons) and reports the errors one causes, e.g. `After setting $n to 0: …`. Scenes are checked at two times and every shader pass is parsed, with errors by pass and line.
- Style arguments (`color:`, `background:`, `size:`) explain why they are refused and point to `tone:`.
- `Chart` series take a tone: `{values, tone}`.

### Changed
- Text, callouts, table cells and step details grow as the reply streams, with an open `**` or code span styled from its first word. Paths, place names, icons and labels you could tap wait for their closing quote.
- Content that appears while a block streams only fades in, at the stream's pace (120–400 ms), and never shifts the conversation.
- Blocks render through BB's code fence renderer slot ([get-bb/bb#5387](https://github.com/get-bb/bb/pull/5387)) where BB has it; older BB keeps the DOM overlay. Built against `@get-bb/plugin-sdk` 0.6.54.
- The plugin's page code grows from 0.9 MB to 1.6 MB (three.js). The GLSL checker runs on the server only.

### Fixed
- An old rejected steer at the end of BB's outline no longer counts as an answer to a reply's buttons.
- Absolute thread-storage, workspace and `/tmp` paths a spec shows can be opened.

## [0.1.0] - 2026-10-11

First release: agents answer with ```ui blocks (86 components in 10 groups, from cards, tables and charts to maps, boards, roadmaps and quizzes), interactive without extra model calls, reading files instead of retyped numbers, and sandboxed ```app blocks for anything else.

[0.2.4]: https://github.com/ComicBit/bb-plugin-genui/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/ComicBit/bb-plugin-genui/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ComicBit/bb-plugin-genui/compare/v0.2.0...v0.2.2
[0.2.1]: https://github.com/ComicBit/bb-plugin-genui/compare/v0.2.0...12acfd6
[0.2.0]: https://github.com/ComicBit/bb-plugin-genui/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ComicBit/bb-plugin-genui/releases/tag/v0.1.0
