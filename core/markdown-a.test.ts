import { describe, expect, it } from "vitest";
import { compile, evaluate, formatDiagnostics, imageSearches, initialState, toMarkdown, toMarkdownWithImages, type SearchedImage } from "./index";
import type { UiNode } from "./types";

function roots(source: string): UiNode[] {
  const { program, diagnostics } = compile(source);
  if (program === null) throw new Error(formatDiagnostics(diagnostics));
  return evaluate(program, initialState(program)).roots;
}

const lamb: SearchedImage = {
  url: "https://upload.wikimedia.org/thumb/lamb (1).jpg",
  creator: "Ann_Bo",
  license: "CC BY-SA 4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Lamb_(1).jpg",
};

describe("ImageSearch and Gallery markdown", () => {
  it("shows a found photo with its credit linked to the Commons page", () => {
    const ui = roots('Card("Dinner", [ImageSearch("slow roasted lamb", alt: "Roast lamb")])');
    expect(imageSearches(ui)).toEqual(["slow roasted lamb"]);
    expect(toMarkdownWithImages(ui, new Map([["slow roasted lamb", lamb]]))).toBe(
      "**Dinner**\n\n" +
        "![Roast lamb](https://upload.wikimedia.org/thumb/lamb%20%281%29.jpg)  \n" +
        "_Photo: Ann\\_Bo, CC BY-SA 4.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lamb_%281%29.jpg)_",
    );
  });

  it("names the picture when the search found nothing or was never run", () => {
    const ui = roots('ImageSearch("tram 28")');
    expect(toMarkdownWithImages(ui, new Map([["tram 28", null]]))).toBe("🖼 tram 28");
    expect(toMarkdown(ui)).toBe("🖼 tram 28");
  });

  it("renders gallery paths, https URLs and searches in order, captions visible", () => {
    const ui = roots(
      'Gallery(["shots/a.png", {src: "https://example.com/b.jpg", caption: "B"}, {query: "slow roasted lamb", caption: "Lamb"}, {query: "nothing"}, {caption: "streaming"}])',
    );
    expect(imageSearches(ui)).toEqual(["slow roasted lamb", "nothing"]);
    expect(toMarkdownWithImages(ui, new Map([["slow roasted lamb", lamb]]))).toBe(
      [
        "🖼 shots/a.png",
        "![B](https://example.com/b.jpg)  \nB",
        "![Lamb](https://upload.wikimedia.org/thumb/lamb%20%281%29.jpg)  \nLamb  \n_Photo: Ann\\_Bo, CC BY-SA 4.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lamb_%281%29.jpg)_",
        "🖼 nothing",
      ].join("\n\n"),
    );
  });

  it("finds searches nested anywhere in the tree, once each", () => {
    const ui = roots('Tabs(["A", "B"], [ImageSearch("cat"), Stack([Gallery([{query: "cat"}, {query: "dog"}])])])');
    expect(imageSearches(ui)).toEqual(["cat", "dog"]);
  });
});

describe("Map markdown", () => {
  it("lists places in order with OpenStreetMap pins or searches, and the route when asked", () => {
    const ui = roots(
      'Map([{name: "Belém Tower", note: "Opens 9:30"}, {name: "Cascais", lat: 38.6979, lng: -9.4215}, {note: "no name yet"}], route: true)',
    );
    expect(toMarkdown(ui)).toBe(
      "Route: Belém Tower → Cascais\n\n" +
        "1. **Belém Tower** — Opens 9:30 · [OpenStreetMap](https://www.openstreetmap.org/search?query=Bel%C3%A9m%20Tower)\n" +
        "2. **Cascais** · [OpenStreetMap](https://www.openstreetmap.org/?mlat=38.6979&mlon=-9.4215#map=15/38.6979/-9.4215)",
    );
  });

  it("ignores out-of-range coordinates and leaves out the route line by default", () => {
    expect(toMarkdown(roots('Map([{name: "Nowhere", lat: 120, lng: 10}])'))).toBe(
      "1. **Nowhere** · [OpenStreetMap](https://www.openstreetmap.org/search?query=Nowhere)",
    );
  });
});
