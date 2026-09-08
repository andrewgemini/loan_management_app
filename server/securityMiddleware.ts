import type { NextFunction, Request, Response } from "express";

const windowMs = 60_000;
const maxRequestsPerWindow = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

function isSameOrigin(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    const allowedHost = req.get("x-forwarded-host") || req.get("host");
    return Boolean(allowedHost && new URL(origin).host === allowedHost);
  } catch {
    return false;
  }
}

export function apiSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = getClientKey(req);
  const now = Date.now();
  const bucket = buckets.get(key);
  const activeBucket = !bucket || bucket.resetAt <= now ? { count: 0, resetAt: now + windowMs } : bucket;
  activeBucket.count += 1;
  buckets.set(key, activeBucket);

  if (activeBucket.count > maxRequestsPerWindow) {
    res.setHeader("Retry-After", Math.ceil((activeBucket.resetAt - now) / 1000));
    return res.status(429).json({ error: "คำขอมากเกินไป กรุณาลองใหม่ภายหลัง" });
  }

  if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
    return res.status(403).json({ error: "คำขอข้ามแหล่งที่มาไม่ถูกต้อง" });
  }

  return next();
}
