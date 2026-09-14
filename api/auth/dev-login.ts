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
    const body = req.body || {};
    const connectionString = (
      process.env.DATABASE_URL
      ?? process.env.POSTGRES_URL
      ?? process.env.POSTGRES_PRISMA_URL
      ?? process.env.POSTGRES_URL_NON_POOLING
    )?.trim();
    const jwtSecret = process.env.JWT_SECRET?.trim() || (connectionString ? `db:${connectionString}` : "");
    if (!connectionString) {
      res.status(503).json({ error: "database_unconfigured" });
      return;
    }
    if (!jwtSecret) {
      res.status(500).json({ error: "session_signing_failed" });
      return;
    }

    const { Pool } = await import("pg");
    const role = body.role || "borrower";
    const selected = body.openId && role
      ? {
          openId: body.openId,
          name: body.name || body.openId,
          email: body.email || null,
          role,
        }
      : (demoUsers[role as keyof typeof demoUsers] || demoUsers.borrower);

    const pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
    });

    try {
      await pool.query(
        `INSERT INTO "users" ("openId", "name", "email", "loginMethod", "role", "lastSignedIn", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT ("openId") DO UPDATE SET
           "name" = EXCLUDED."name",
           "email" = EXCLUDED."email",
           "loginMethod" = EXCLUDED."loginMethod",
           "role" = EXCLUDED."role",
           "lastSignedIn" = NOW(),
           "updatedAt" = NOW()` ,
        [selected.openId, selected.name || null, selected.email ?? null, "local", selected.role]
      );
    } catch (error) {
      console.error("[Auth] Dev login database step failed:", error);
      await pool.end().catch(() => undefined);
      res.status(503).json({ error: "database_connection_failed" });
      return;
    }

    const { createHmac } = await import("node:crypto");
    const issuedAt = Date.now();
    const payload = {
      openId: selected.openId,
      appId: process.env.VITE_APP_ID || "",
      name: selected.name || "",
      exp: Math.floor((issuedAt + ONE_YEAR_MS) / 1000),
    };
    const encode = (value: string) => Buffer.from(value).toString("base64url");
    const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const bodyPart = encode(JSON.stringify(payload));
    const unsigned = `${header}.${bodyPart}`;
    const signature = createHmac("sha256", jwtSecret).update(unsigned).digest("base64url");
    const sessionToken = `${unsigned}.${signature}`;

    const userResult = await pool.query(
      `SELECT "id", "openId", "name", "email", "avatar_url", "loginMethod", "role", "createdAt", "updatedAt", "lastSignedIn"
       FROM "users" WHERE "openId" = $1 LIMIT 1`,
      [selected.openId]
    );
    await pool.end().catch(() => undefined);

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

    res.status(200).json({ success: true, user: userResult.rows[0] || null });
  } catch (error) {
    console.error("[Auth] Dev login failed:", error);
    res.status(500).json({ error: "Failed to perform local login" });
  }
}
