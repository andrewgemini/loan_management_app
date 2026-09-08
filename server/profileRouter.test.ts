import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn(), updateUserAvatarUrl: vi.fn(), clearUserAvatarUrl: vi.fn() }));
const storageMock = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("./db", () => dbMock);
vi.mock("./storage", () => storageMock);

import { profileRouter } from "./routers/profileRouter";

function caller(id = 11) {
  return profileRouter.createCaller({ user: { id, role: "borrower", name: "Borrower", openId: "borrower-test" } as any, req: {} as any, res: {} as any } as any);
}

describe("profileRouter.uploadAvatar", () => {
  beforeEach(() => {
    dbMock.getDb.mockReset();
    dbMock.updateUserAvatarUrl.mockReset();
    dbMock.clearUserAvatarUrl.mockReset();
    storageMock.storagePut.mockReset();
    storageMock.storagePut.mockResolvedValue({ key: "avatars/11/avatar-test.png", url: "https://storage.test/avatar.png" });
    dbMock.updateUserAvatarUrl.mockResolvedValue(undefined);
    dbMock.clearUserAvatarUrl.mockResolvedValue(undefined);
  });

  it("uploads an allowed avatar and persists only the managed URL for the authenticated account", async () => {
    const result = await caller(11).uploadAvatar({ dataUrl: "data:image/png;base64,aGVsbG8=", mimeType: "image/png" });
    expect(result).toEqual({ avatarUrl: "https://storage.test/avatar.png" });
    expect(storageMock.storagePut).toHaveBeenCalledWith(expect.stringMatching(/^avatars\/11\/avatar-\d+\.png$/), expect.any(Buffer), "image/png");
    expect(dbMock.updateUserAvatarUrl).toHaveBeenCalledWith(11, "https://storage.test/avatar.png");
  });

  it("rejects a data URL whose declared MIME type does not match the request", async () => {
    await expect(caller().uploadAvatar({ dataUrl: "data:image/jpeg;base64,aGVsbG8=", mimeType: "image/png" })).rejects.toThrow("ชนิดไฟล์รูปโปรไฟล์ไม่ตรงกับข้อมูลที่ส่งมา");
    expect(storageMock.storagePut).not.toHaveBeenCalled();
  });

  it("clears the persisted avatar URL only for the authenticated account", async () => {
    await expect(caller(11).removeAvatar()).resolves.toEqual({ avatarUrl: null });
    expect(dbMock.clearUserAvatarUrl).toHaveBeenCalledWith(11);
  });
});
