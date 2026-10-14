// Why the basemap is missing, kept apart from the component so the rule can be
// tested: tiles are fetched one by one and usually fail for the same reason, so
// the first failure is the one shown, and it is forgotten once the level on
// screen is complete. A tile that lands re-checks that question — the map
// renders readiness from the tile cache, and this state is what makes a render
// happen when it changes.

export interface BasemapState {
  /** The first failure of the level on screen, or null. */
  readonly error: string | null;
  /** How many tiles have arrived; the component's effect watches it. */
  readonly arrivals: number;
}

export type BasemapAction =
  | { readonly kind: "tile-failed"; readonly error: string }
  | { readonly kind: "tile-arrived" }
  /** Every tile of the level on screen is on the page. */
  | { readonly kind: "level-loaded" };

export const NO_BASEMAP: BasemapState = { error: null, arrivals: 0 };

export function basemapReducer(state: BasemapState, action: BasemapAction): BasemapState {
  switch (action.kind) {
    // Later failures of the same level add nothing: they are usually the same
    // reason, and rewriting the line as each one answers would only flicker.
    case "tile-failed":
      return state.error === null ? { error: action.error, arrivals: state.arrivals } : state;
    case "tile-arrived":
      return { error: state.error, arrivals: state.arrivals + 1 };
    // Coming back to the same value keeps identity, and React skips the render.
    case "level-loaded":
      return state.error === null ? state : { error: null, arrivals: state.arrivals };
  }
}

/** The line above the map, or null while the basemap is (or may still be) fine. */
export function basemapMessage(state: BasemapState): string | null {
  return state.error === null ? null : `Couldn't load the basemap: ${state.error}`;
}
