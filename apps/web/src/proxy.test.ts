import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });
const location = (res: Response) => res.headers.get("location");

describe("proxy", () => {
  it("sends a visitor with no session cookie to /sign-in", () => {
    expect(location(proxy(request("/")))).toBe("http://localhost:3000/sign-in");
  });
  it("lets a visitor with a cookie through to the app (requireUser does the real check)", () => {
    expect(location(proxy(request("/", "better-auth.session_token=anything.value")))).toBeNull();
  });
  it("never redirects away from /sign-in, whatever the cookie: a stale cookie must not cause a loop", () => {
    expect(location(proxy(request("/sign-in")))).toBeNull();
    expect(location(proxy(request("/sign-in", "better-auth.session_token=bogus.value")))).toBeNull();
  });
});
