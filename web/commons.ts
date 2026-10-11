// Image search on Wikimedia Commons. Chosen over Openverse after comparing
// both on everyday queries ("slow roasted lamb shoulder", "Lisbon tram 28"):
// Commons ranked on-topic photos first where Openverse mixed in salads and an
// art edit, holds only free licences (Openverse's top hits were mostly
// NonCommercial/NoDerivs Flickr photos), has no 200-requests-a-day anonymous
// cap, and scales thumbnails server-side to the width asked for.
import { z } from "zod";

/** A photo found for a description, with what its licence asks to be credited. */
export const foundImageSchema = z.object({
  /** https URL of a scaled rendition (≤ THUMB_WIDTH wide). */
  url: z.string(),
  width: z.number(),
  height: z.number(),
  title: z.string(),
  creator: z.string(),
  /** Short licence name ("CC BY-SA 4.0", "Public domain"). */
  license: z.string(),
  licenseUrl: z.string().nullable(),
  /** The file's page on Commons, which holds the full attribution. */
  sourceUrl: z.string(),
});

export type FoundImage = z.infer<typeof foundImageSchema>;

const API = "https://commons.wikimedia.org/w/api.php";
/** A standard Wikimedia thumbnail step, sharp at chat width on a 2× screen. */
export const THUMB_WIDTH = 1280;
const CANDIDATES = 12;
const MIN_WIDTH = 480;

/** The API request for `query`: bitmap files only, with the metadata a credit needs. */
export function searchUrl(query: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(CANDIDATES),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|ObjectName",
    maxlag: "5",
  });
  return `${API}?${params}`;
}

/** Plain text from an extmetadata HTML fragment (artist links, spans). */
function plain(html: unknown): string {
  if (typeof html !== "string") return "";
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => entities[name])
    .replace(/\s+/g, " ")
    .trim();
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function metadata(fields: Readonly<Record<string, unknown>>, name: string): string {
  return plain(record(fields[name]).value);
}

function https(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, "https://commons.wikimedia.org");
    // Commons now appends utm_ tracking parameters to thumbnail URLs.
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The best photo in a search response: in search order, the first JPEG wide
 * enough to fill a chat column (PNGs on Commons are mostly diagrams and
 * screenshots, so one is taken only when no JPEG qualifies). Null when none fits.
 */
export function pickImage(response: unknown): FoundImage | null {
  const pages = record(record(response).query).pages;
  if (!Array.isArray(pages)) return null;
  const candidates = pages
    .map(record)
    .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
    .flatMap((page): (FoundImage & { mime: string })[] => {
      const info = record(Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined);
      const mime = typeof info.mime === "string" ? info.mime : "";
      const width = Number(info.width);
      const height = Number(info.height);
      const url = https(info.thumburl) ?? https(info.url);
      const sourceUrl = https(info.descriptionurl);
      if (url === null || sourceUrl === null || !Number.isFinite(width) || !Number.isFinite(height)) return [];
      if (width < MIN_WIDTH || height < MIN_WIDTH * 0.5) return [];
      if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") return [];
      const fields = record(info.extmetadata);
      const fileTitle = typeof page.title === "string" ? page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "") : "";
      const thumbWidth = Number(info.thumbwidth);
      const thumbHeight = Number(info.thumbheight);
      const scaled = Number.isFinite(thumbWidth) && Number.isFinite(thumbHeight) && thumbWidth > 0;
      return [
        {
          mime,
          url,
          width: scaled ? thumbWidth : width,
          height: scaled ? thumbHeight : height,
          title: (metadata(fields, "ObjectName") || fileTitle).slice(0, 200),
          creator: (metadata(fields, "Artist") || "Unknown author").slice(0, 120),
          license: metadata(fields, "LicenseShortName") || "See source page",
          licenseUrl: https(record(fields.LicenseUrl).value),
          sourceUrl,
        },
      ];
    });
  const chosen = candidates.find((candidate) => candidate.mime === "image/jpeg") ?? candidates[0];
  if (chosen === undefined) return null;
  const { mime: _mime, ...image } = chosen;
  return image;
}
