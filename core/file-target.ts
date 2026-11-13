// Where a path a spec names opens in BB's file preview. It follows the rule
// data-source.ts reads by, so a file a spec can show is a file it can open:
// `$BB_THREAD_STORAGE/…` and absolute paths inside the thread storage open in
// the storage; relative paths and absolute paths inside the workspace open in
// the workspace; absolute paths in the host's /tmp open on the host; any
// other absolute path opens nothing. Roots on a Windows host are Windows
// paths (`C:\…`, `\\server\share\…`), matched by Windows rules: either slash,
// any letter case.

/** The prefix a spec uses for the thread's storage, where agents write artifacts. */
export const THREAD_STORAGE_PREFIX = "$BB_THREAD_STORAGE/";

export type FileOpenTarget =
  | { readonly kind: "thread-storage"; readonly path: string }
  | { readonly kind: "workspace"; readonly path: string }
  | { readonly kind: "host"; readonly path: string };

/** The thread's absolute roots; null when it has none (or they are not needed). */
export interface FileRoots {
  readonly storage: string | null;
  readonly workspace: string | null;
}

const TEMP_ROOTS = ["/tmp", "/private/tmp"];

/** A drive path (`C:\…`, `C:/…`) or a UNC path (`\\server\share\…`). */
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/;

/** Whether `path` is absolute on some host: a POSIX path or a Windows drive or UNC path. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || WINDOWS_ABSOLUTE.test(path);
}

/** An absolute path split into its root (`/`, `C:`, `\\server\share`) and its parts, `.` and `..` resolved. */
interface Absolute {
  readonly windows: boolean;
  readonly root: string;
  readonly parts: readonly string[];
}

/** `path` as an Absolute, or null when it isn't absolute or `..` climbs above its root. */
function normalizeAbsolute(path: string): Absolute | null {
  let windows: boolean;
  let root: string;
  let rest: string;
  if (path.startsWith("/")) {
    [windows, root, rest] = [false, "/", path];
  } else {
    const match = WINDOWS_ABSOLUTE.exec(path);
    if (match === null) return null;
    const head = match[0];
    // A drive is "C:" plus its slash; a UNC root is "\\server\share".
    const drive = /^[A-Za-z]:[\\/]$/.test(head);
    [windows, root, rest] = [true, drive ? head.slice(0, 2).toUpperCase() : head.replace(/\//g, "\\"), path.slice(head.length)];
  }
  const parts: string[] = [];
  for (const part of rest.split(windows ? /[\\/]/ : "/")) {
    if (part === "" || part === ".") continue;
    if (part !== "..") parts.push(part);
    else if (parts.pop() === undefined) return null;
  }
  return { windows, root, parts };
}

/** `target` relative to `root` (`/`-separated) when it lies strictly inside it, else null. */
function inside(root: string | null, target: Absolute): string | null {
  const base = root === null ? null : normalizeAbsolute(root);
  if (base === null || base.windows !== target.windows || target.parts.length <= base.parts.length) return null;
  // Windows paths compare case-insensitively, as the file system does.
  const same = (a: string, b: string) => (target.windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (!same(base.root, target.root) || !base.parts.every((part, index) => same(part, target.parts[index]))) return null;
  return target.parts.slice(base.parts.length).join("/");
}

/** Where `requested` opens, or null when it is an absolute path outside every root a spec may read. */
export function fileOpenTarget(requested: string, roots: FileRoots): FileOpenTarget | null {
  if (requested.startsWith(THREAD_STORAGE_PREFIX)) {
    return { kind: "thread-storage", path: requested.slice(THREAD_STORAGE_PREFIX.length) };
  }
  if (!isAbsolutePath(requested)) return { kind: "workspace", path: requested };
  const target = normalizeAbsolute(requested);
  if (target === null) return null;
  const inStorage = inside(roots.storage, target);
  if (inStorage !== null) return { kind: "thread-storage", path: inStorage };
  const inWorkspace = inside(roots.workspace, target);
  if (inWorkspace !== null) return { kind: "workspace", path: inWorkspace };
  // A Windows host has no /tmp; data-source.ts doesn't read it there either.
  const host = roots.workspace ?? roots.storage;
  const windowsHost = host !== null && WINDOWS_ABSOLUTE.test(host);
  if (!windowsHost && TEMP_ROOTS.some((root) => inside(root, target) !== null)) return { kind: "host", path: `/${target.parts.join("/")}` };
  return null;
}
