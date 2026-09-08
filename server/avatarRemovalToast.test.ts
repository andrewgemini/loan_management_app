import { describe, expect, it, vi } from "vitest";
import { notifyAvatarRemovalError, notifyAvatarRemovalSuccess } from "../client/src/lib/avatarRemovalToast";

describe("Avatar removal Toast flow", () => {
  it("notifies the user after a successful avatar reset", () => {
    const toast = { success: vi.fn(), error: vi.fn() };
    notifyAvatarRemovalSuccess(toast);
    expect(toast.success).toHaveBeenCalledWith("คืนค่าเป็นรูปโปรไฟล์เริ่มต้นแล้ว");
  });

  it("notifies the user of a mutation error with the server message or safe fallback", () => {
    const toast = { success: vi.fn(), error: vi.fn() };
    notifyAvatarRemovalError(toast, new Error("ลบรูปไม่สำเร็จ"));
    notifyAvatarRemovalError(toast, undefined);
    expect(toast.error).toHaveBeenNthCalledWith(1, "ลบรูปไม่สำเร็จ");
    expect(toast.error).toHaveBeenNthCalledWith(2, "ไม่สามารถลบรูปโปรไฟล์ได้");
  });
});
