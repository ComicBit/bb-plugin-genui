import { describe, expect, it } from "vitest";
import { basemapMessage, basemapReducer, NO_BASEMAP, type BasemapState } from "./mapBasemap";

const failed = (state: BasemapState, error: string) => basemapReducer(state, { kind: "tile-failed", error });
const arrived = (state: BasemapState) => basemapReducer(state, { kind: "tile-arrived" });
const loaded = (state: BasemapState) => basemapReducer(state, { kind: "level-loaded" });

describe("basemapReducer", () => {
  it("says nothing until something fails", () => {
    expect(basemapMessage(NO_BASEMAP)).toBeNull();
    expect(basemapMessage(loaded(arrived(NO_BASEMAP)))).toBeNull();
  });

  it("shows the first failure of the level, not the latest", () => {
    const one = failed(NO_BASEMAP, "the server answered 429");
    expect(basemapMessage(one)).toBe("Couldn't load the basemap: the server answered 429");
    const many = failed(failed(one, "the request timed out"), "the connection closed early");
    expect(basemapMessage(many)).toBe("Couldn't load the basemap: the server answered 429");
  });

  it("keeps the failure while tiles are still arriving", () => {
    const state = arrived(arrived(failed(NO_BASEMAP, "the request timed out")));
    expect(basemapMessage(state)).toBe("Couldn't load the basemap: the request timed out");
    // An arrival is what lets the component re-check the level it is showing.
    expect(state.arrivals).toBe(2);
  });

  it("forgets the failure once the level on screen is complete", () => {
    const settled = loaded(failed(NO_BASEMAP, "the host stopped responding"));
    expect(basemapMessage(settled)).toBeNull();
  });

  it("answers a completed level with the same state, so no render is needed", () => {
    const clean = arrived(NO_BASEMAP);
    expect(loaded(clean)).toBe(clean);
    const broken = failed(clean, "the request timed out");
    expect(failed(broken, "later")).toBe(broken);
  });

  it("can fail again after a level it had nothing to say about", () => {
    const recovered = loaded(failed(NO_BASEMAP, "the request timed out"));
    const again = failed(arrived(recovered), "the server answered 403");
    expect(basemapMessage(again)).toBe("Couldn't load the basemap: the server answered 403");
  });
});
