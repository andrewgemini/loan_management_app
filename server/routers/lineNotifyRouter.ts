import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, userLineTokens, loanRequests } from "../../drizzle/schema";
import { eq, inArray, or } from "drizzle-orm";
import {
  sendLineNotify,
  verifyLineNotifyToken,
  revokeLineNotifyToken,
  sendNewLoanRequestLineNotification,
  sendLoanApprovalLineNotification,
  sendLoanRejectionLineNotification,
  sendPaymentPendingLineNotification,
} from "../lineNotifyService";
import {
  shouldSendLineLoanApproval,
  shouldSendLineLoanRejection,
  shouldSendLineNewLoanRequest,
  shouldSendLinePaymentReminder,
  recordNotificationPreferenceAudit,
} from "../notificationPreferencesDb";

export const lineNotifyRouter = router({
  /**
   * เชื่อมต่อ LINE Notify Token
   */
  connectLineNotify: protectedProcedure
    .input(
      z.object({
        accessToken: z.string().min(1, "Access token is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // ตรวจสอบว่า token ถูกต้องหรือไม่
        const isValid = await verifyLineNotifyToken(input.accessToken);
        if (!isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid LINE Notify token",
          });
        }

        // ลบ token เก่าถ้ามี
        await db
          .delete(userLineTokens)
          .where(eq(userLineTokens.userId, ctx.user.id));

        // บันทึก token ใหม่
        await db.insert(userLineTokens).values({
          userId: ctx.user.id,
          lineToken: input.accessToken,
        });

        await recordNotificationPreferenceAudit(ctx.user.id, "line_connected", ["lineNotify"]);

        return { success: true, message: "LINE Notify connected successfully" };
      } catch (error) {
        console.error("[LINE Notify] Connection failed:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to connect LINE Notify",
        });
      }
    }),

  /**
   * ดูสถานะการเชื่อมต่อ LINE Notify
   */
  getLineNotifyStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      return { connected: false };
    }

    try {
      const token = await db
        .select()
        .from(userLineTokens)
        .where(eq(userLineTokens.userId, ctx.user.id))
        .limit(1);

      if (!token || token.length === 0) {
        return { connected: false };
      }

      // ตรวจสอบว่า token ยังใช้งานได้หรือไม่
      const isValid = await verifyLineNotifyToken(token[0].lineToken);

      return {
        connected: isValid,
        connectedAt: token[0].createdAt,
      };
    } catch (error) {
      console.error("[LINE Notify] Status check failed:", error);
      return { connected: false };
    }
  }),

  /**
   * ยกเลิกการเชื่อมต่อ LINE Notify
   */
  disconnectLineNotify: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    try {
      const token = await db
        .select()
        .from(userLineTokens)
        .where(eq(userLineTokens.userId, ctx.user.id))
        .limit(1);

      if (token && token.length > 0) {
        // ยกเลิก token จาก LINE
        await revokeLineNotifyToken(token[0].lineToken);

        // ลบ token จากฐานข้อมูล
        await db
          .delete(userLineTokens)
          .where(eq(userLineTokens.userId, ctx.user.id));

        await recordNotificationPreferenceAudit(ctx.user.id, "line_disconnected", ["lineNotify"]);
      }

      return { success: true, message: "LINE Notify disconnected successfully" };
    } catch (error) {
      console.error("[LINE Notify] Disconnection failed:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to disconnect LINE Notify",
      });
    }
  }),

  /**
   * ส่งข้อความทดสอบ
   */
  sendTestMessage: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    try {
      const token = await db
        .select()
        .from(userLineTokens)
        .where(eq(userLineTokens.userId, ctx.user.id))
        .limit(1);

      if (!token || token.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "LINE Notify not connected",
        });
      }

      const success = await sendLineNotify(token[0].lineToken, {
        message: "🧪 ข้อความทดสอบจากระบบกู้ยืมเงิน\n\nหากได้รับข้อความนี้ แสดงว่าการเชื่อมต่อสำเร็จแล้ว",
      });

      if (!success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send test message",
        });
      }

      return { success: true, message: "Test message sent successfully" };
    } catch (error) {
      console.error("[LINE Notify] Test message failed:", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to send test message",
      });
    }
  }),

  /**
   * ส่งแจ้งเตือนคำขอกู้ใหม่ไปยัง Admin/Lender ที่เชื่อมต่อ LINE
   * (เรียกใช้จาก notification procedure)
   */
  sendNewLoanRequestNotification: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "borrower" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอกู้" });
      }

      const db = await getDb();
      if (!db) {
        console.warn("[LINE Notify] Database not available");
        return { success: false };
      }

      const requestRows = await db
        .select({
          borrowerId: loanRequests.borrowerId,
          amountRequested: loanRequests.amountRequested,
          interestRate: loanRequests.interestRate,
          loanTermMonths: loanRequests.loanTermMonths,
        })
        .from(loanRequests)
        .where(eq(loanRequests.id, input.requestId))
        .limit(1);
      const request = requestRows[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบคำขอกู้" });
      if (ctx.user.role === "borrower" && request.borrowerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอนี้" });
      }

      const borrowerRows = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, request.borrowerId))
        .limit(1);
      const borrowerName = borrowerRows[0]?.name || "ผู้กู้";

      try {
        // ดึง Admin/Lender ทั้งหมดที่เชื่อมต่อ LINE
        const adminsAndLenders = await db
          .select()
          .from(users)
          .where(inArray(users.role, ["admin", "lender"]));

        // ส่งแจ้งเตือนให้ทุกคน
        for (const user of adminsAndLenders) {
          const token = await db
            .select()
            .from(userLineTokens)
            .where(eq(userLineTokens.userId, user.id))
            .limit(1);

          if (token && token.length > 0 && (await shouldSendLineNewLoanRequest(user.id))) {
            await sendNewLoanRequestLineNotification(
              token[0].lineToken,
              borrowerName,
              request.amountRequested,
              request.interestRate,
              request.loanTermMonths,
              input.requestId,
              "/admin"
            );
          }
        }

        return { success: true };
      } catch (error) {
        console.error("[LINE Notify] Failed to send notification:", error);
        return { success: false };
      }
    }),

  /**
   * ส่งแจ้งเตือนการอนุมัติให้ผู้กู้
   */
  sendLoanApprovalNotification: protectedProcedure
    .input(
      z.object({
        borrowerId: z.number(),
        borrowerName: z.string(),
        loanAmount: z.string(),
        monthlyPayment: z.string(),
        requestId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์ส่งการแจ้งเตือนอนุมัติ" });
      const db = await getDb();
      if (!db) {
        console.warn("[LINE Notify] Database not available");
        return { success: false };
      }

      try {
        if (!(await shouldSendLineLoanApproval(input.borrowerId))) {
          return { success: true, skipped: true };
        }

        const token = await db
          .select()
          .from(userLineTokens)
          .where(eq(userLineTokens.userId, input.borrowerId))
          .limit(1);

        if (token && token.length > 0) {
          await sendLoanApprovalLineNotification(
            token[0].lineToken,
            input.borrowerName,
            input.loanAmount,
            input.monthlyPayment,
            input.requestId
          );
        }

        return { success: true };
      } catch (error) {
        console.error("[LINE Notify] Failed to send approval notification:", error);
        return { success: false };
      }
    }),

  /**
   * ส่งแจ้งเตือนการปฏิเสธให้ผู้กู้
   */
  sendLoanRejectionNotification: protectedProcedure
    .input(
      z.object({
        borrowerId: z.number(),
        borrowerName: z.string(),
        requestId: z.number(),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์ส่งการแจ้งเตือนปฏิเสธ" });
      const db = await getDb();
      if (!db) {
        console.warn("[LINE Notify] Database not available");
        return { success: false };
      }

      try {
        if (!(await shouldSendLineLoanRejection(input.borrowerId))) {
          return { success: true, skipped: true };
        }

        const token = await db
          .select()
          .from(userLineTokens)
          .where(eq(userLineTokens.userId, input.borrowerId))
          .limit(1);

        if (token && token.length > 0) {
          await sendLoanRejectionLineNotification(
            token[0].lineToken,
            input.borrowerName,
            input.requestId,
            input.rejectionReason
          );
        }

        return { success: true };
      } catch (error) {
        console.error("[LINE Notify] Failed to send rejection notification:", error);
        return { success: false };
      }
    }),

  /**
   * ส่งแจ้งเตือนการชำระเงินรอตรวจสอบ
   */
  sendPaymentPendingNotification: protectedProcedure
    .input(
      z.object({
        borrowerId: z.number(),
        borrowerName: z.string(),
        amountPaid: z.string(),
        paymentDate: z.string(),
        requestId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new TRPCError({ code: "FORBIDDEN", message: "ไม่มีสิทธิ์ส่งการแจ้งเตือนการชำระเงิน" });
      const db = await getDb();
      if (!db) {
        console.warn("[LINE Notify] Database not available");
        return { success: false };
      }

      try {
        if (!(await shouldSendLinePaymentReminder(input.borrowerId))) {
          return { success: true, skipped: true };
        }

        const token = await db
          .select()
          .from(userLineTokens)
          .where(eq(userLineTokens.userId, input.borrowerId))
          .limit(1);

        if (token && token.length > 0) {
          await sendPaymentPendingLineNotification(
            token[0].lineToken,
            input.borrowerName,
            input.amountPaid,
            input.paymentDate,
            input.requestId
          );
        }

        return { success: true };
      } catch (error) {
        console.error("[LINE Notify] Failed to send payment notification:", error);
        return { success: false };
      }
    }),
});
