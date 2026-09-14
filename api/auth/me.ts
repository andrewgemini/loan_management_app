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

    const [{ sdk }, db] = await Promise.all([
      import("../../server/_core/sdk"),
      import("../../server/db"),
    ]);
    const session = await sdk.verifySession(cookieValue);
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
