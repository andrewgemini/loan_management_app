import { describe, expect, it } from "vitest";
import { avatarRemovalFallbackErrorMessage, avatarRemovalSuccessMessage, getAvatarRemovalErrorMessage } from "../client/src/lib/avatarToastMessages";

describe("Avatar removal toast messages", () => {
  it("provides a clear confirmation message after reset", () => {
    expect(avatarRemovalSuccessMessage).toBe("คืนค่าเป็นรูปโปรไฟล์เริ่มต้นแล้ว");
  });

  it("uses the server error when available and a safe fallback otherwise", () => {
    expect(getAvatarRemovalErrorMessage(new Error("สิทธิ์ไม่เพียงพอ"))).toBe("สิทธิ์ไม่เพียงพอ");
    expect(getAvatarRemovalErrorMessage(undefined)).toBe(avatarRemovalFallbackErrorMessage);
  });
});
