import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getNotificationPreferences,
  createDefaultNotificationPreferences,
  getNotificationPreferenceAuditLogs,
  recordNotificationPreferenceAudit,
  updateNotificationPreferences,
} from "../notificationPreferencesDb";

export const notificationPreferencesRouter = router({
  /**
   * ดึงการตั้งค่าการแจ้งเตือนของผู้ใช้ปัจจุบัน
   */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    try {
      let prefs = await getNotificationPreferences(ctx.user.id);

      // ถ้าไม่มีการตั้งค่า ให้สร้างเริ่มต้น
      if (!prefs) {
        prefs = await createDefaultNotificationPreferences(ctx.user.id);
      }

      await recordNotificationPreferenceAudit(ctx.user.id, "read");

      return prefs;
    } catch (error) {
      console.error("[NotificationPreferences] Failed to get preferences:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get notification preferences",
      });
    }
  }),

  /**
   * อัปเดตการตั้งค่าการแจ้งเตือน
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        emailNewLoanRequest: z.boolean().optional(),
        emailLoanApproval: z.boolean().optional(),
        emailLoanRejection: z.boolean().optional(),
        emailPaymentReminder: z.boolean().optional(),
        emailPaymentConfirmation: z.boolean().optional(),
        lineNewLoanRequest: z.boolean().optional(),
        lineLoanApproval: z.boolean().optional(),
        lineLoanRejection: z.boolean().optional(),
        linePaymentReminder: z.boolean().optional(),
        linePaymentConfirmation: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateNotificationPreferences(ctx.user.id, input);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update notification preferences",
          });
        }

        await recordNotificationPreferenceAudit(ctx.user.id, "updated", Object.keys(input));

        return updated;
      } catch (error) {
        console.error("[NotificationPreferences] Failed to update preferences:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update notification preferences",
        });
      }
    }),

  /**
   * อัปเดตการตั้งค่าอีเมล
   */
  updateEmailPreferences: protectedProcedure
    .input(
      z.object({
        emailNewLoanRequest: z.boolean().optional(),
        emailLoanApproval: z.boolean().optional(),
        emailLoanRejection: z.boolean().optional(),
        emailPaymentReminder: z.boolean().optional(),
        emailPaymentConfirmation: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateNotificationPreferences(ctx.user.id, input);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update email preferences",
          });
        }

        await recordNotificationPreferenceAudit(ctx.user.id, "updated", Object.keys(input));

        return updated;
      } catch (error) {
        console.error("[NotificationPreferences] Failed to update email preferences:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update email preferences",
        });
      }
    }),

  /**
   * อัปเดตการตั้งค่า LINE
   */
  updateLinePreferences: protectedProcedure
    .input(
      z.object({
        lineNewLoanRequest: z.boolean().optional(),
        lineLoanApproval: z.boolean().optional(),
        lineLoanRejection: z.boolean().optional(),
        linePaymentReminder: z.boolean().optional(),
        linePaymentConfirmation: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateNotificationPreferences(ctx.user.id, input);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update LINE preferences",
          });
        }

        await recordNotificationPreferenceAudit(ctx.user.id, "updated", Object.keys(input));

        return updated;
      } catch (error) {
        console.error("[NotificationPreferences] Failed to update LINE preferences:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update LINE preferences",
        });
      }
    }),

  /**
   * รีเซ็ตการตั้งค่าการแจ้งเตือนเป็นค่าเริ่มต้น
   */
  resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const updated = await updateNotificationPreferences(ctx.user.id, {
        emailNewLoanRequest: true,
        emailLoanApproval: true,
        emailLoanRejection: true,
        emailPaymentReminder: true,
        emailPaymentConfirmation: true,
        lineNewLoanRequest: true,
        lineLoanApproval: true,
        lineLoanRejection: true,
        linePaymentReminder: true,
        linePaymentConfirmation: true,
      });

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to reset preferences",
          });
        }

        await recordNotificationPreferenceAudit(ctx.user.id, "reset", [
          "emailNewLoanRequest", "emailLoanApproval", "emailLoanRejection", "emailPaymentReminder", "emailPaymentConfirmation",
          "lineNewLoanRequest", "lineLoanApproval", "lineLoanRejection", "linePaymentReminder", "linePaymentConfirmation",
        ]);

        return updated;
    } catch (error) {
      console.error("[NotificationPreferences] Failed to reset preferences:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to reset preferences",
      });
    }
  }),

  /** แสดง audit trail เฉพาะบัญชีที่ล็อกอิน */
  getAuditLogs: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(8) }).optional())
    .query(async ({ ctx, input }) => {
      return getNotificationPreferenceAuditLogs(ctx.user.id, input?.limit ?? 8);
    }),
});
