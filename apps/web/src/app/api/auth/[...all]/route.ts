import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// Better Auth answers every /api/auth/* request (sign-in, sign-up, sign-out, session).
export const { GET, POST } = toNextJsHandler(auth);
