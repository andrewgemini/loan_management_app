const COOKIE_NAME = "app_session_id";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const demoUsers = {
  admin: {
    openId: "demo-admin",
    name: "Demo Admin",
    email: "demo-admin@example.invalid",
    role: "admin",
  },
  lender: {
    openId: "demo-lender",
    name: "Demo Lender",
    email: "demo-lender@example.invalid",
    role: "lender",
  },
  borrower: {
    openId: "demo-borrower",
    name: "Demo Borrower",
    email: "demo-borrower@example.invalid",
    role: "borrower",
  },
} as const;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const [db, { sdk }] = await Promise.all([
      import("../../server/db"),
      import("../../server/_core/sdk"),
    ]);
    const body = req.body || {};
    const role = body.role || "borrower";
    const selected = body.openId && role
      ? {
          openId: body.openId,
          name: body.name || body.openId,
          email: body.email || null,
          role,
        }
      : (demoUsers[role as keyof typeof demoUsers] || demoUsers.borrower);

    try {
      await db.upsertUser({
        openId: selected.openId,
        name: selected.name || null,
        email: selected.email ?? null,
        loginMethod: "local",
        role: selected.role,
        lastSignedIn: new Date(),
      });
    } catch (error) {
      console.error("[Auth] Dev login database step failed:", error);
      res.status(503).json({ error: "database_unavailable" });
      return;
    }

    let sessionToken: string;
    try {
      sessionToken = await sdk.createSessionToken(selected.openId, {
        name: selected.name || "",
      });
    } catch (error) {
      console.error("[Auth] Dev login session signing failed:", error);
      res.status(500).json({ error: "session_signing_failed" });
      return;
    }

    const forwardedProto = req.headers["x-forwarded-proto"];
    const secure = Array.isArray(forwardedProto)
      ? forwardedProto.some((value: string) => value.trim().toLowerCase() === "https")
      : String(forwardedProto || "").split(",").some(value => value.trim().toLowerCase() === "https");

    const cookieParts = [
      `${COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=None",
      `Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`,
    ];
    if (secure) cookieParts.push("Secure");
    res.setHeader("Set-Cookie", cookieParts.join("; "));

    let user;
    try {
      user = await db.getUserByOpenId(selected.openId);
    } catch (error) {
      console.error("[Auth] Dev login user lookup failed:", error);
      res.status(503).json({ error: "database_unavailable" });
      return;
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("[Auth] Dev login failed:", error);
    res.status(500).json({ error: "Failed to perform local login" });
  }
}
