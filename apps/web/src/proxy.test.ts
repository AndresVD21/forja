import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const request = (path: string, cookie?: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, { method: init.method, headers: { ...(cookie ? { cookie } : {}), ...init.headers } });
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
  it("lets a visitor with no cookie open /sign-up (the invite page), query string included", () => {
    expect(location(proxy(request("/sign-up?invite=abc")))).toBeNull();
    expect(location(proxy(request("/sign-up", "better-auth.session_token=bogus.value")))).toBeNull();
  });
  it("lets a server action POST through without a cookie (the action answers signed_out; a redirect would lose the draft)", () => {
    expect(location(proxy(request("/workouts/new", undefined, { method: "POST", headers: { "next-action": "abc123" } })))).toBeNull();
  });
  it("still redirects a plain POST, or a GET carrying the header, when there is no cookie", () => {
    expect(location(proxy(request("/workouts/new", undefined, { method: "POST" })))).toBe("http://localhost:3000/sign-in");
    expect(location(proxy(request("/workouts/new", undefined, { headers: { "next-action": "abc123" } })))).toBe("http://localhost:3000/sign-in");
  });
});
