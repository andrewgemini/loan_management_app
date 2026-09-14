import { parse as parseCookieHeader } from "cookie";
import { Pool } from "pg";
import { jwtVerify } from "jose";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { isValidSessionIdentity } from "../authSession";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

async function authenticateFromLocalSession(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!token || !ENV.cookieSecret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(ENV.cookieSecret), {
      algorithms: ["HS256"],
    });
    if (!isValidSessionIdentity(payload)) return null;

    const connectionString = (
      process.env.POSTGRES_URL
      ?? process.env.POSTGRES_PRISMA_URL
      ?? process.env.POSTGRES_URL_NON_POOLING
      ?? process.env.DATABASE_URL
    )?.trim();
    if (!connectionString) return null;

    const runtimeConnectionString = connectionString
      .replace(/([?&])sslmode=[^&]*/i, "$1")
      .replace(/([?&])channel_binding=[^&]*/i, "$1")
      .replace(/[?&]$/, "");
    const pool = new Pool({
      connectionString: runtimeConnectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      family: 4,
      ssl: { rejectUnauthorized: false },
    } as any);

    try {
      const result = await pool.query(
        `SELECT "id", "openId", "name", "email", "avatar_url", "loginMethod", "role", "createdAt", "updatedAt", "lastSignedIn"
         FROM "users" WHERE "openId" = $1 LIMIT 1`,
        [payload.openId]
      );
      return (result.rows[0] as User | undefined) ?? null;
    } finally {
      await pool.end().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = await authenticateFromLocalSession(opts.req);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
