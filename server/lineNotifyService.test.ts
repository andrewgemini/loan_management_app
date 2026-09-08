import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedAxios = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("axios", () => ({ default: mockedAxios }));

import {
  revokeLineNotifyToken,
  sendLineNotify,
  verifyLineNotifyToken,
} from "./lineNotifyService";

describe("lineNotifyService", () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
  });

  it("returns false without an access token", async () => {
    expect(await sendLineNotify("", { message: "hello" })).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("sends a notification with bearer authorization", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });

    const result = await sendLineNotify("token-123", { message: "ทดสอบแจ้งเตือน" });

    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://notify-api.line.me/api/notify",
      expect.any(URLSearchParams),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      })
    );
  });

  it("verifies and revokes a token through LINE endpoints", async () => {
    mockedAxios.get.mockResolvedValue({ status: 200 });
    mockedAxios.post.mockResolvedValue({ status: 200 });

    expect(await verifyLineNotifyToken("token-123")).toBe(true);
    expect(await revokeLineNotifyToken("token-123")).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://notify-api.line.me/api/status",
      expect.objectContaining({ headers: { Authorization: "Bearer token-123" } })
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://notify-api.line.me/api/revoke",
      {},
      expect.objectContaining({ headers: { Authorization: "Bearer token-123" } })
    );
  });
});
