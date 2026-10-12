import { describe, test, expect, vi } from "vitest";
import {
  fetchWeekPng,
  shareFileName,
  shareMode,
  shareWeek,
} from "../../src/web/static/share.js";

const blob = new Blob(["png"], { type: "image/png" });

// Enough of a document for the download fallback.
function fakeDoc() {
  const clicked = [];
  return {
    clicked,
    body: { append: () => {} },
    createElement: () => ({
      click() {
        clicked.push({ href: this.href, download: this.download });
      },
      remove() {},
    }),
  };
}

describe("shareMode", () => {
  const file = new File([blob], "meals-2026-10-12.png");
  test("share where files can be shared", () => {
    const nav = { canShare: () => true, share: () => {} };
    expect(shareMode(nav, file)).toBe("share");
  });
  test.each([
    ["no Web Share", {}],
    ["no file sharing", { canShare: () => false, share: () => {} }],
    ["canShare but no share", { canShare: () => true }],
    ["no navigator", undefined],
  ])("download with %s", (_, nav) => {
    expect(shareMode(nav, file)).toBe("download");
  });
});

describe("shareWeek", () => {
  test("opens the share sheet with the week's PNG attached", async () => {
    const share = vi.fn(async () => {});
    const nav = { canShare: () => true, share };
    const doc = fakeDoc();
    expect(await shareWeek("2026-10-12", blob, { nav, doc })).toBe("share");
    const { files } = share.mock.calls[0][0];
    expect(files[0].name).toBe("meals-2026-10-12.png");
    expect(files[0].type).toBe("image/png");
    expect(doc.clicked).toEqual([]);
  });

  test("closing the share sheet is not an error", async () => {
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    const nav = { canShare: () => true, share: () => Promise.reject(abort) };
    expect(await shareWeek("2026-10-12", blob, { nav, doc: fakeDoc() })).toBe(
      "share",
    );
  });

  test("a refused share falls back to the download; other errors surface", async () => {
    const refused = Object.assign(new Error("no"), { name: "NotAllowedError" });
    const doc = fakeDoc();
    const nav = { canShare: () => true, share: () => Promise.reject(refused) };
    expect(await shareWeek("2026-10-12", blob, { nav, doc })).toBe("download");
    expect(doc.clicked[0].download).toBe("meals-2026-10-12.png");

    const broken = {
      canShare: () => true,
      share: () => Promise.reject(new Error("x")),
    };
    await expect(
      shareWeek("2026-10-12", blob, { nav: broken, doc: fakeDoc() }),
    ).rejects.toThrow("x");
  });

  test("without file sharing, downloads meals-YYYY-MM-DD.png", async () => {
    const doc = fakeDoc();
    expect(
      await shareWeek("2026-10-12", Promise.resolve(blob), { nav: {}, doc }),
    ).toBe("download");
    expect(doc.clicked).toEqual([
      {
        href: expect.stringMatching(/^blob:/),
        download: "meals-2026-10-12.png",
      },
    ]);
    expect(shareFileName("2026-10-19")).toBe("meals-2026-10-19.png");
  });
});

describe("fetchWeekPng", () => {
  test("fetches the week's PNG with the session cookie", async () => {
    const fetchFn = vi.fn(async () => new Response(blob));
    expect(await fetchWeekPng("2026-10-12", fetchFn)).toBeInstanceOf(Blob);
    expect(fetchFn).toHaveBeenCalledWith("/week/2026-10-12.png", {
      credentials: "same-origin",
    });
  });
  test("an error response rejects", async () => {
    const fetchFn = async () => new Response("", { status: 404 });
    await expect(fetchWeekPng("2026-10-12", fetchFn)).rejects.toThrow("404");
  });
});
