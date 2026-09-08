import { describe, expect, it } from "vitest";
import { isCronSessionIdentity, isValidSessionIdentity, shouldSyncOAuthUser } from "./authSession";

describe("auth session contracts", () => {
  it("accepts a complete session identity and rejects missing fields", () => {
    expect(isValidSessionIdentity({ openId: "oauth-1", appId: "app-1", name: "ผู้ใช้" })).toBe(true);
    expect(isValidSessionIdentity({ openId: "oauth-1", appId: "app-1", name: "" })).toBe(false);
    expect(isValidSessionIdentity(null)).toBe(false);
  });

  it("recognizes scheduled task identities", () => {
    expect(isCronSessionIdentity("cron_payment-reminders")).toBe(true);
    expect(isCronSessionIdentity("oauth-user-1")).toBe(false);
  });

  it("syncs only when the OAuth user is not in the local database", () => {
    expect(shouldSyncOAuthUser(false)).toBe(true);
    expect(shouldSyncOAuthUser(true)).toBe(false);
  });
});
