import { describe, expect, it } from "vitest";
import { fileOpenTarget, isAbsolutePath } from "./file-target";

describe("fileOpenTarget on a POSIX host", () => {
  const roots = { storage: "/home/u/.bb/thread-storage/thr_1", workspace: "/work/repo" };

  it("opens thread storage, workspace and /tmp paths", () => {
    expect(fileOpenTarget("$BB_THREAD_STORAGE/a.png", roots)).toEqual({ kind: "thread-storage", path: "a.png" });
    expect(fileOpenTarget("src/a.ts", roots)).toEqual({ kind: "workspace", path: "src/a.ts" });
    expect(fileOpenTarget("/home/u/.bb/thread-storage/thr_1/x/a.png", roots)).toEqual({ kind: "thread-storage", path: "x/a.png" });
    expect(fileOpenTarget("/work/repo/./src/../a.ts", roots)).toEqual({ kind: "workspace", path: "a.ts" });
    expect(fileOpenTarget("/tmp/shot.png", roots)).toEqual({ kind: "host", path: "/tmp/shot.png" });
  });

  it("opens nothing outside its roots", () => {
    expect(fileOpenTarget("/etc/passwd", roots)).toBeNull();
    expect(fileOpenTarget("/work/repo2/a.ts", roots)).toBeNull();
    expect(fileOpenTarget("/work/repo", roots)).toBeNull();
    expect(fileOpenTarget("/WORK/REPO/a.ts", roots)).toBeNull();
    expect(fileOpenTarget("/../a", roots)).toBeNull();
    expect(fileOpenTarget("C:\\work\\repo\\a.ts", roots)).toBeNull();
  });
});

describe("fileOpenTarget on a Windows host", () => {
  const roots = { storage: "C:\\Users\\u\\.bb\\thread-storage\\thr_1", workspace: "E:\\repo" };

  it("places drive paths in either slash and any case inside the roots", () => {
    expect(fileOpenTarget("C:\\Users\\u\\.bb\\thread-storage\\thr_1\\x\\a.png", roots)).toEqual({ kind: "thread-storage", path: "x/a.png" });
    expect(fileOpenTarget("C:/Users/u/.bb/thread-storage/thr_1/a.png", roots)).toEqual({ kind: "thread-storage", path: "a.png" });
    expect(fileOpenTarget("c:\\users\\U\\.BB\\thread-storage\\thr_1\\a.png", roots)).toEqual({ kind: "thread-storage", path: "a.png" });
    expect(fileOpenTarget("E:/repo/src/../notes/x.md", roots)).toEqual({ kind: "workspace", path: "notes/x.md" });
  });

  it("keeps relative and storage paths as written", () => {
    expect(fileOpenTarget("$BB_THREAD_STORAGE/a.png", roots)).toEqual({ kind: "thread-storage", path: "a.png" });
    expect(fileOpenTarget("notes/x.md", roots)).toEqual({ kind: "workspace", path: "notes/x.md" });
  });

  it("opens nothing outside its roots, and there is no /tmp", () => {
    expect(fileOpenTarget("C:\\Windows\\win.ini", roots)).toBeNull();
    expect(fileOpenTarget("D:\\repo\\a.ts", roots)).toBeNull();
    expect(fileOpenTarget("E:\\repo2\\a.ts", roots)).toBeNull();
    expect(fileOpenTarget("E:\\repo\\..\\secret.txt", roots)).toBeNull();
    expect(fileOpenTarget("C:\\..\\a", roots)).toBeNull();
    expect(fileOpenTarget("/tmp/shot.png", roots)).toBeNull();
  });

  it("matches UNC roots", () => {
    const unc = { storage: null, workspace: "\\\\nas\\share\\repo" };
    expect(fileOpenTarget("\\\\nas\\share\\repo\\a.ts", unc)).toEqual({ kind: "workspace", path: "a.ts" });
    expect(fileOpenTarget("//nas/share/repo/a.ts", unc)).toBeNull();
    expect(fileOpenTarget("\\\\nas\\other\\repo\\a.ts", unc)).toBeNull();
  });
});

describe("isAbsolutePath", () => {
  it("knows POSIX, drive and UNC paths", () => {
    for (const path of ["/a", "C:\\a", "c:/a", "\\\\nas\\share\\a"]) expect(isAbsolutePath(path)).toBe(true);
    for (const path of ["a", "src/a.ts", "C:a", "$BB_THREAD_STORAGE/a", "..\\a"]) expect(isAbsolutePath(path)).toBe(false);
  });
});
