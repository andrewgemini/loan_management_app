import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, loanRequests } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  sendEmail,
  getNewLoanRequestEmailTemplate,
  getLoanRequestConfirmationEmailTemplate,
  getLoanApprovalEmailTemplate,
} from "../emailService";
import {
  shouldSendEmailLoanApproval,
  shouldSendEmailLoanRejection,
  shouldSendEmailNewLoanRequest,
} from "../notificationPreferencesDb";

export const notificationRouter = router({
  /**
   * ส่งอีเมลแจ้งเตือนเมื่อมีคำขอกู้ใหม่ (ส่งให้ Lender/Admin)
   * เรียกใช้จาก createRequest procedure
   */
  sendNewLoanRequestNotification: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "borrower" && ctx.user.role !== "admin") {
        throw new Error("ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอกู้");
      }
      const db = await getDb();
      if (!db) {
        console.warn("[Notification] Database not available");
        return { success: false };
      }

      try {
        const request = await db
          .select({ borrowerId: loanRequests.borrowerId, amountRequested: loanRequests.amountRequested, interestRate: loanRequests.interestRate, loanTermMonths: loanRequests.loanTermMonths })
          .from(loanRequests)
          .where(eq(loanRequests.id, input.requestId))
          .limit(1);
        if (!request[0]) throw new Error("ไม่พบคำขอกู้");
        if (ctx.user.role === "borrower" && request[0].borrowerId !== ctx.user.id) {
          throw new Error("ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอนี้");
        }

        const borrower = await db
          .select()
          .from(users)
          .where(eq(users.id, request[0].borrowerId))
          .limit(1);

        if (!borrower || borrower.length === 0) {
          throw new Error("Borrower not found");
        }

        const borrowerName = borrower[0].name || "Unknown";

        // ดึงข้อมูล Lender/Admin ทั้งหมด
        const lenders = await db
          .select()
          .from(users)
          .where(eq(users.role, "lender"));

        const admins = await db
          .select()
          .from(users)
          .where(eq(users.role, "admin"));

        const recipients = [...lenders, ...admins];

        // ส่งอีเมลให้ Lender/Admin
        const dashboardUrl = `${process.env.VITE_APP_FRONTEND_URL || "http://localhost:3000"}/admin`;

        for (const recipient of recipients) {
          if (!recipient.email) continue;
          if (!(await shouldSendEmailNewLoanRequest(recipient.id))) continue;

          const emailTemplate = getNewLoanRequestEmailTemplate(
            recipient.name || "Lender",
            borrowerName,
            request[0].amountRequested,
            request[0].interestRate,
            request[0].loanTermMonths,
            input.requestId,
            dashboardUrl
          );

          await sendEmail({
            to: recipient.email,
            subject: `[ใหม่] คำขอกู้ยืมเงินจาก ${borrowerName} - #${input.requestId}`,
            html: emailTemplate,
          });
        }

        // ส่งอีเมลยืนยันให้ผู้กู้เมื่อเปิดการแจ้งเตือนคำขอกู้ใหม่
        if (borrower[0].email && (await shouldSendEmailNewLoanRequest(request[0].borrowerId))) {
          const confirmationTemplate = getLoanRequestConfirmationEmailTemplate(
            borrowerName,
            request[0].amountRequested,
            request[0].interestRate,
            input.requestId
          );

          await sendEmail({
            to: borrower[0].email,
            subject: "ยืนยันการส่งคำขอกู้ยืมเงิน",
            html: confirmationTemplate,
          });
        }

        console.log(
          `[Notification] Sent new loan request notification for request #${input.requestId}`
        );
        return { success: true };
      } catch (error) {
        console.error("[Notification] Failed to send notification:", error);
        if (error instanceof Error && (error.message === "ไม่พบคำขอกู้" || error.message === "ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอนี้")) {
          throw error;
        }
        return { success: false };
      }
    }),

  /**
   * ส่งอีเมลแจ้งเตือนเมื่อคำขอกู้ได้รับการอนุมัติ
   */
  sendLoanApprovalNotification: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        borrowerId: z.number(),
        loanAmount: z.string(),
        interestRate: z.string(),
        loanTermMonths: z.number(),
        monthlyPayment: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new Error("ไม่มีสิทธิ์ส่งการแจ้งเตือนอนุมัติ");
      const db = await getDb();
      if (!db) {
        console.warn("[Notification] Database not available");
        return { success: false };
      }

      try {
        // ดึงข้อมูลผู้กู้
        const borrower = await db
          .select()
          .from(users)
          .where(eq(users.id, input.borrowerId))
          .limit(1);

        if (!borrower || borrower.length === 0 || !borrower[0].email) {
          throw new Error("Borrower not found or no email");
        }

        const borrowerName = borrower[0].name || "Unknown";

        if (!(await shouldSendEmailLoanApproval(input.borrowerId))) {
          return { success: true, skipped: true };
        }

        const approvalTemplate = getLoanApprovalEmailTemplate(
          borrowerName,
          input.loanAmount,
          input.interestRate,
          input.loanTermMonths,
          input.monthlyPayment,
          input.requestId
        );

        await sendEmail({
          to: borrower[0].email,
          subject: "🎉 คำขอกู้ของคุณได้รับการอนุมัติแล้ว",
          html: approvalTemplate,
        });

        console.log(
          `[Notification] Sent loan approval notification for request #${input.requestId}`
        );
        return { success: true };
      } catch (error) {
        console.error("[Notification] Failed to send approval notification:", error);
        return { success: false };
      }
    }),

  /**
   * ส่งอีเมลแจ้งเตือนเมื่อคำขอกู้ถูกปฏิเสธ
   */
  sendLoanRejectionNotification: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        borrowerId: z.number(),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new Error("ไม่มีสิทธิ์ส่งการแจ้งเตือนปฏิเสธ");
      const db = await getDb();
      if (!db) {
        console.warn("[Notification] Database not available");
        return { success: false };
      }

      try {
        // ดึงข้อมูลผู้กู้
        const borrower = await db
          .select()
          .from(users)
          .where(eq(users.id, input.borrowerId))
          .limit(1);

        if (!borrower || borrower.length === 0 || !borrower[0].email) {
          throw new Error("Borrower not found or no email");
        }

        const borrowerName = borrower[0].name || "Unknown";

        if (!(await shouldSendEmailLoanRejection(input.borrowerId))) {
          return { success: true, skipped: true };
        }

        const rejectionTemplate = `
          <!DOCTYPE html>
          <html lang="th">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f5f5f5;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .header {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                padding: 20px;
                border-radius: 8px 8px 0 0;
                text-align: center;
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
              }
              .content {
                padding: 20px;
              }
              .message {
                background-color: #fee2e2;
                border-left: 4px solid #ef4444;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
                color: #7f1d1d;
              }
              .reason {
                background-color: #fef2f2;
                border-left: 4px solid #f87171;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
              }
              .footer {
                background-color: #f9fafb;
                padding: 15px;
                border-radius: 0 0 8px 8px;
                font-size: 12px;
                color: #6b7280;
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>❌ คำขอกู้ถูกปฏิเสธ</h1>
              </div>
              
              <div class="content">
                <p>สวัสดี ${borrowerName},</p>
                
                <div class="message">
                  <strong>เสียใจที่ต้องแจ้งให้ทราบว่า คำขอกู้ของคุณไม่ได้รับการอนุมัติ</strong>
                </div>
                
                ${
                  input.rejectionReason
                    ? `
                  <div class="reason">
                    <h3 style="margin-top: 0;">เหตุผลในการปฏิเสธ:</h3>
                    <p>${input.rejectionReason}</p>
                  </div>
                `
                    : ""
                }
                
                <p style="color: #6b7280;">
                  หากคุณมีคำถามหรือต้องการข้อมูลเพิ่มเติม กรุณาติดต่อผู้ให้กู้หรือผู้ดูแลระบบ
                </p>
              </div>
              
              <div class="footer">
                <p>© 2024 Loan Management System. All rights reserved.</p>
                <p>อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบ กรุณาไม่ตอบกลับ</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await sendEmail({
          to: borrower[0].email,
          subject: "❌ คำขอกู้ของคุณถูกปฏิเสธ",
          html: rejectionTemplate,
        });

        console.log(
          `[Notification] Sent loan rejection notification for request #${input.requestId}`
        );
        return { success: true };
      } catch (error) {
        console.error("[Notification] Failed to send rejection notification:", error);
        return { success: false };
      }
    }),
});
