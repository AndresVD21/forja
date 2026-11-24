// The real Better Auth with the rate limit switched on, counting in the `rate_limits` table of a PGlite database.
import type { Database } from "@forja/db";
import { rateLimits } from "@forja/db/schema";
import { createTestDb } from "@forja/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "./create-auth";

let db: Database;
let auth: Auth;

beforeAll(async () => {
  db = await createTestDb();
  auth = createAuth(db, { transactions: false, rateLimit: true, secret: "test-secret-test-secret-test-secret-123", baseURL: "http://localhost:3000" });
});

const signIn = (ip: string) =>
  auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "nobody@example.test", password: "wrong password" }),
    }),
  );

describe("sign-in rate limit", () => {
  it("allows 5 attempts a minute per address, then answers 429; counts are rows in the database", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) expect((await signIn("203.0.113.7")).status).not.toBe(429);
    expect((await signIn("203.0.113.7")).status).toBe(429);

    const rows = await db.select().from(rateLimits);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(5);
    expect(rows[0]!.key).toContain("/sign-in/email");
  });

  it("counts each address on its own", async () => {
    expect((await signIn("203.0.113.8")).status).not.toBe(429);
  });
});
