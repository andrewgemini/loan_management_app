import { parse as parseCookieHeader } from "cookie";
import * as db from "../../server/db";
import { sdk } from "../../server/_core/sdk";
import { COOKIE_NAME } from "../../shared/const";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const session = await sdk.verifySession(cookies[COOKIE_NAME]);
    if (!session) {
      res.status(401).json({ user: null });
      return;
    }

    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      res.status(401).json({ user: null });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("[Auth] Session lookup failed:", error);
    res.status(500).json({ error: "Failed to resolve current session" });
  }
}
