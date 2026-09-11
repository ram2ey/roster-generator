import { afterEach, describe, expect, it, vi } from "vitest";
import { removeStaff, updateStaff } from "./api";

function mockFetch(status: number, body: unknown = {}) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("does not send Content-Type on a bodyless DELETE", async () => {
    const fetchMock = mockFetch(200, { ok: true });
    await removeStaff("s1");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("sends Content-Type on a request with a JSON body", async () => {
    const fetchMock = mockFetch(200, { ok: true });
    await updateStaff("s1", { name: "New name" });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
