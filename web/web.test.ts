import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { CACHE_MIGRATIONS, WebCache } from "./cache";
import { pickImage } from "./commons";
import { pickLocation } from "./geocode";
import { declaresImage, sniffImage } from "./image";

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("sniffImage", () => {
  it("names image types by their leading bytes", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(text("GIF89a...."))).toBe("image/gif");
    expect(sniffImage(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(text("\0\0\0\x1cftypavif"))).toBe("image/avif");
    expect(sniffImage(text('\uFEFF<?xml version="1.0"?>\n<!-- c -->\n<!DOCTYPE svg>\n<svg xmlns="x"/>'))).toBe("image/svg+xml");
  });

  it("refuses what only claims to be an image", () => {
    expect(sniffImage(text("<!doctype html><html><body><svg></svg>"))).toBeNull();
    expect(sniffImage(text('{"error":"not found"}'))).toBeNull();
    expect(sniffImage(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(sniffImage(bytes())).toBeNull();
  });

  it("reads image Content-Types, parameters aside", () => {
    expect(declaresImage("image/jpeg")).toBe(true);
    expect(declaresImage("image/svg+xml; charset=utf-8")).toBe(true);
    expect(declaresImage("text/html")).toBe(false);
    expect(declaresImage("application/octet-stream")).toBe(false);
    expect(declaresImage(undefined)).toBe(false);
  });
});

function page(index: number, fields: { mime?: string; width?: number; artist?: string; thumb?: boolean }) {
  return {
    index,
    title: `File:Photo ${index}.jpg`,
    imageinfo: [
      {
        mime: fields.mime ?? "image/jpeg",
        width: fields.width ?? 4000,
        height: 3000,
        url: `https://upload.wikimedia.org/o/${index}.jpg`,
        descriptionurl: `https://commons.wikimedia.org/wiki/File:Photo_${index}.jpg`,
        ...(fields.thumb === false
          ? {}
          : { thumburl: `https://upload.wikimedia.org/t/${index}.jpg`, thumbwidth: 1280, thumbheight: 960 }),
        extmetadata: {
          Artist: { value: fields.artist ?? '<a href="//commons.wikimedia.org/wiki/User:Ann">Ann &amp; Bo</a>' },
          LicenseShortName: { value: "CC BY-SA 4.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
        },
      },
    ],
  };
}

describe("pickImage", () => {
  it("takes the first wide-enough JPEG in search order, with its credit", () => {
    const response = { query: { pages: [page(3, {}), page(1, { mime: "image/png" }), page(2, { width: 300 })] } };
    expect(pickImage(response)).toEqual({
      url: "https://upload.wikimedia.org/t/3.jpg",
      width: 1280,
      height: 960,
      title: "Photo 3",
      creator: "Ann & Bo",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Photo_3.jpg",
    });
  });

  it("falls back to a PNG, then the original when there is no thumbnail", () => {
    const png = pickImage({ query: { pages: [page(1, { mime: "image/png", thumb: false })] } });
    expect(png?.url).toBe("https://upload.wikimedia.org/o/1.jpg");
    expect(png?.width).toBe(4000);
  });

  it("finds nothing in empty, malformed or unusable answers", () => {
    expect(pickImage({ batchcomplete: true })).toBeNull();
    expect(pickImage(null)).toBeNull();
    expect(pickImage({ query: { pages: [page(1, { mime: "image/tiff" }), page(2, { width: 200 })] } })).toBeNull();
  });

  it("credits an unknown author rather than nobody", () => {
    expect(pickImage({ query: { pages: [page(1, { artist: "  " })] } })?.creator).toBe("Unknown author");
  });
});

describe("pickLocation", () => {
  it("reads GeoJSON [lng, lat] of the first feature", () => {
    const response = { features: [{ geometry: { coordinates: [-9.2159, 38.6916] }, properties: {} }] };
    expect(pickLocation(response)).toEqual({ lat: 38.6916, lng: -9.2159 });
  });

  it("finds nothing in empty or out-of-range answers", () => {
    expect(pickLocation({ features: [] })).toBeNull();
    expect(pickLocation({ features: [{ geometry: { coordinates: [200, 10] } }] })).toBeNull();
    expect(pickLocation("nope")).toBeNull();
  });
});

describe("WebCache", () => {
  function cacheAt(clock: { now: number }, maxBytes: number) {
    const db = new Database(":memory:");
    for (const statement of CACHE_MIGRATIONS) db.exec(statement);
    return new WebCache(() => db, maxBytes, () => clock.now);
  }

  it("serves entries, marks them expired after their ttl, and renews them", () => {
    const clock = { now: 1_000 };
    const cache = cacheAt(clock, 1_000_000);
    cache.put("a", Buffer.from("body"), '{"mime":"image/png"}', 500);
    expect(cache.get("a")).toMatchObject({ meta: '{"mime":"image/png"}', expired: false });
    clock.now = 1_500;
    expect(cache.get("a")?.expired).toBe(true);
    cache.renew("a", "{}", 500);
    expect(cache.get("a")).toMatchObject({ meta: "{}", expired: false });
    expect(cache.get("missing")).toBeNull();
  });

  it("evicts least recently used entries once over its size", () => {
    const clock = { now: 0 };
    // Each entry counts 1000 body bytes plus 256 bookkeeping: three fit, a fourth doesn't.
    const cache = cacheAt(clock, 4_000);
    for (const key of ["a", "b", "c"]) {
      clock.now += 1;
      cache.put(key, Buffer.alloc(1000), "", 10_000);
    }
    clock.now += 1;
    cache.get("a");
    clock.now += 1;
    cache.put("d", Buffer.alloc(1000), "", 10_000);
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).not.toBeNull();
    expect(cache.get("d")).not.toBeNull();
    expect(cache.size()).toBeLessThanOrEqual(4_000 * 0.8);
  });
});
