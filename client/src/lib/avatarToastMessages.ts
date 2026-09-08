export const avatarRemovalSuccessMessage = "คืนค่าเป็นรูปโปรไฟล์เริ่มต้นแล้ว";
export const avatarRemovalFallbackErrorMessage = "ไม่สามารถลบรูปโปรไฟล์ได้";

export function getAvatarRemovalErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : avatarRemovalFallbackErrorMessage;
}
