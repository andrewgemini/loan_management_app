import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";
import express, { type Express, type Request, type Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/auth/me", async (req: Request, res: Response) => {
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

      res.json({ user });
    } catch (error) {
      console.error("[Auth] Session lookup failed:", error);
      res.status(500).json({ error: "Failed to resolve current session" });
    }
  });

  // Original Manus OAuth callback
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed:", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  // Local / Demo Login endpoint for standalone and local development
  app.post("/api/auth/dev-login", express.json(), async (req: Request, res: Response) => {
    try {
      const { role = "borrower", openId, name, email } = req.body || {};

      const demoUsers: Record<string, { openId: string; name: string; email: string; role: "admin" | "lender" | "borrower" }> = {
        admin: { openId: "demo-admin", name: "Demo Admin", email: "demo-admin@example.invalid", role: "admin" },
        lender: { openId: "demo-lender", name: "Demo Lender", email: "demo-lender@example.invalid", role: "lender" },
        borrower: { openId: "demo-borrower", name: "Demo Borrower", email: "demo-borrower@example.invalid", role: "borrower" },
      };

      const selected = (openId && role)
        ? { openId, name: name || openId, email: email || null, role }
        : (demoUsers[role] || demoUsers.borrower);

      await db.upsertUser({
        openId: selected.openId,
        name: selected.name || null,
        email: selected.email ?? null,
        loginMethod: "local",
        role: selected.role,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(selected.openId, {
        name: selected.name || "",
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      const user = await db.getUserByOpenId(selected.openId);
      res.json({ success: true, user });
    } catch (error) {
      console.error("[Auth] Dev login failed:", error);
      res.status(500).json({ error: "Failed to perform local login" });
    }
  });
}
