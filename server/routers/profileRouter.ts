import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { clearUserAvatarUrl, getDb, updateUserAvatarUrl } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "../storage";

const avatarInput = z.object({
  dataUrl: z.string().max(3_000_000),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

export const profileRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [profile] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    return profile;
  }),
  uploadAvatar: protectedProcedure.input(avatarInput).mutation(async ({ ctx, input }) => {
    const expectedPrefix = `data:${input.mimeType};base64,`;
    if (!input.dataUrl.startsWith(expectedPrefix)) throw new Error("ชนิดไฟล์รูปโปรไฟล์ไม่ตรงกับข้อมูลที่ส่งมา");
    const encoded = input.dataUrl.slice(expectedPrefix.length);
    if (!encoded) throw new Error("รูปโปรไฟล์ไม่ถูกต้อง");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) throw new Error("รูปโปรไฟล์ต้องมีขนาดไม่เกิน 2 MB");
    const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const uploaded = await storagePut(`avatars/${ctx.user.id}/avatar-${Date.now()}.${extension}`, bytes, input.mimeType);
    await updateUserAvatarUrl(ctx.user.id, uploaded.url);
    return { avatarUrl: uploaded.url };
  }),
  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    await clearUserAvatarUrl(ctx.user.id);
    return { avatarUrl: null };
  }),
});
