import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("./db", () => dbMock);

import { sdk } from "./_core/sdk";

function requestWithCookie(cookie: string) {
  return {
    headers: { cookie: `app_session_id=${cookie}` },
  } as any;
}

describe("SDK authentication flow", () => {
  beforeEach(() => {
    dbMock.getUserByOpenId.mockReset();
    dbMock.upsertUser.mockReset();
  });

  it("rejects a missing or malformed session cookie", async () => {
    await expect(sdk.authenticateRequest({ headers: {} } as any)).rejects.toThrow();
    await expect(sdk.authenticateRequest(requestWithCookie("not-a-jwt"))).rejects.toThrow();
  });

  it("syncs a missing OAuth user and refreshes the local user after login", async () => {
    const sessionToken = await sdk.createSessionToken("oauth-user-1", { name: "ผู้ใช้ทดสอบ" });
    const syncedUser = {
      id: 42,
      openId: "oauth-user-1",
      name: "ผู้ใช้ทดสอบ",
      email: "user@example.com",
      loginMethod: "google",
      role: "borrower",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    dbMock.getUserByOpenId.mockResolvedValueOnce(undefined).mockResolvedValueOnce(syncedUser).mockResolvedValueOnce(syncedUser);
    dbMock.upsertUser.mockResolvedValue(undefined);
    vi.spyOn(sdk, "getUserInfoWithJwt").mockResolvedValue({
      openId: "oauth-user-1",
      projectId: "app-1",
      name: "ผู้ใช้ทดสอบ",
      email: "user@example.com",
      platform: "google",
      loginMethod: "google",
    });

    const result = await sdk.authenticateRequest(requestWithCookie(sessionToken));

    expect(result).toEqual(syncedUser);
    expect(dbMock.upsertUser).toHaveBeenCalledWith(expect.objectContaining({
      openId: "oauth-user-1",
      email: "user@example.com",
      loginMethod: "google",
    }));
    expect(dbMock.upsertUser).toHaveBeenLastCalledWith({ openId: "oauth-user-1", lastSignedIn: expect.any(Date) });
  });
});
