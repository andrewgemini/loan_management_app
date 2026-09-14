const COOKIE_NAME = "app_session_id";

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return undefined;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const cookieValue = readCookie(req.headers.cookie, COOKIE_NAME);
    if (!cookieValue) {
      res.status(401).json({ user: null });
      return;
    }

    const connectionString = (
      process.env.POSTGRES_URL
      ?? process.env.POSTGRES_PRISMA_URL
      ?? process.env.POSTGRES_URL_NON_POOLING
      ?? process.env.DATABASE_URL
    )?.trim();
    const jwtSecret = process.env.JWT_SECRET?.trim() || (connectionString ? `db:${connectionString}` : "");
    if (!jwtSecret || !connectionString) {
      res.status(503).json({ user: null });
      return;
    }

    const parts = cookieValue.split(".");
    if (parts.length !== 3) {
      res.status(401).json({ user: null });
      return;
    }

    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const [headerPart, bodyPart, signaturePart] = parts;
    const expectedSignature = createHmac("sha256", jwtSecret)
      .update(`${headerPart}.${bodyPart}`)
      .digest("base64url");
    const expectedBuffer = Buffer.from(expectedSignature);
    const actualBuffer = Buffer.from(signaturePart);
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      res.status(401).json({ user: null });
      return;
    }

    const payload = JSON.parse(Buffer.from(bodyPart, "base64url").toString("utf8"));
    if (!payload?.openId || typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
      res.status(401).json({ user: null });
      return;
    }

    const { Pool } = await import("pg");
    const runtimeConnectionString = connectionString
      .replace(/([?&])sslmode=[^&]*/i, "$1")
      .replace(/([?&])channel_binding=[^&]*/i, "$1")
      .replace(/[?&]$/, "");
    const pool = new Pool({
      connectionString: runtimeConnectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: false },
    });
    const result = await pool.query(
      `SELECT "id", "openId", "name", "email", "avatar_url", "loginMethod", "role", "createdAt", "updatedAt", "lastSignedIn"
       FROM "users" WHERE "openId" = $1 LIMIT 1`,
      [payload.openId]
    );
    await pool.end().catch(() => undefined);

    if (!result.rows[0]) {
      res.status(401).json({ user: null });
      return;
    }

    res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error("[Auth] Session lookup failed:", error);
    res.status(500).json({ error: "Failed to resolve current session" });
  }
}
