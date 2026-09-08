import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createLoanRequest,
  getLoanRequestById,
  getLoanRequestsByBorrower,
  getPendingLoanRequests,
  approveLoanRequest,
  rejectLoanRequest,
  createLoan,
  getLoanById,
  getLoansByBorrower,
  getLoansByLender,
  createAmortizationSchedules,
  getAmortizationSchedule,
  createLoanPayment,
  getLoanPayments,
  getPendingPaymentVerifications,
  getPaymentById,
  verifyPayment,
  rejectPayment,
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  getAdminStats,
} from "../db";
import { generateAmortizationSchedule, calculateLoanSummary } from "../loanCalculations";
import { storagePut } from "../storage";
import generatePromptPayPayload from "promptpay-qr";
import {
  approveRequestInputSchema,
  canCreateLoanRequest,
  canManageLoan,
  createLoanRequestInputSchema,
  rejectPaymentInputSchema,
  rejectRequestInputSchema,
  uploadPaymentSlipInputSchema,
  verifyPaymentInputSchema,
} from "../loanContracts";

export { approveRequestInputSchema, canCreateLoanRequest, canManageLoan, createLoanRequestInputSchema, rejectPaymentInputSchema, rejectRequestInputSchema, uploadPaymentSlipInputSchema, verifyPaymentInputSchema } from "../loanContracts";

export const loanRouter = router({
  // ===== Loan Request Procedures =====
  
  /**
   * ผู้กู้สร้างคำขอกู้ยืมเงิน
   */
  createRequest: protectedProcedure
    .input(createLoanRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canCreateLoanRequest(ctx.user.role)) {
        throw new Error("เฉพาะผู้กู้เท่านั้นที่สามารถสร้างคำขอกู้");
      }

      const result = await createLoanRequest({
        borrowerId: ctx.user.id,
        amountRequested: input.amountRequested.toString(),
        interestRate: input.interestRate.toString(),
        loanTermMonths: input.loanTermMonths,
        interestType: input.interestType,
        paymentType: input.paymentType,
      });

      return result;
    }),

  /**
   * ดูคำขอกู้ของตัวเอง (ผู้กู้)
   */
  getMyRequests: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "borrower") {
      return [];
    }
    return await getLoanRequestsByBorrower(ctx.user.id);
  }),

  /**
   * ดูคำขอกู้เฉพาะรายการ
   */
  getRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const request = await getLoanRequestById(input.id);
      if (!request) throw new Error("ไม่พบคำขอกู้");
      if (ctx.user.role === "borrower" && request.borrowerId !== ctx.user.id) {
        throw new Error("ไม่มีสิทธิ์เข้าถึงคำขอนี้");
      }
      return request;
    }),

  /**
   * ดูคำขอกู้ที่รอการอนุมัติ (Admin/Lender)
   */
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") {
      throw new Error("ไม่มีสิทธิ์เข้าถึง");
    }
    return await getPendingLoanRequests();
  }),

  /**
   * อนุมัติคำขอกู้ (Admin/Lender)
   */
  approveRequest: protectedProcedure
    .input(approveRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageLoan(ctx.user.role)) {
        throw new Error("ไม่มีสิทธิ์อนุมัติคำขอ");
      }

      const request = await getLoanRequestById(input.requestId);
      if (!request) throw new Error("ไม่พบคำขอกู้");

      // สร้างสัญญาเงินกู้
      const loanParams = {
        principal: parseFloat(request.amountRequested),
        annualRate: parseFloat(request.interestRate),
        months: request.loanTermMonths,
        interestType: request.interestType as "simple" | "compound",
        paymentType: request.paymentType as "fixed" | "reducing",
      };

      const summary = calculateLoanSummary(loanParams);
      const startDate = new Date();
      const nextPaymentDate = new Date(startDate);
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      // สร้างสัญญาเงินกู้
      const loanResult = await createLoan({
        requestId: input.requestId,
        borrowerId: request.borrowerId,
        lenderId: ctx.user.id,
        principalAmount: request.amountRequested,
        interestRate: request.interestRate,
        loanTermMonths: request.loanTermMonths,
        interestType: request.interestType,
        paymentType: request.paymentType,
        startDate,
        nextPaymentDate,
      });

      // สร้างตารางผ่อนชำระ
      const loanId = (loanResult as any).insertId || 0;
      const scheduleData = summary.schedule.map((item) => ({
        loanId,
        paymentNumber: item.paymentNumber,
        dueDate: item.dueDate,
        startingBalance: item.startingBalance.toString(),
        principalDue: item.principal.toString(),
        interestDue: item.interest.toString(),
        totalPaymentDue: item.totalPayment.toString(),
        endingBalance: item.endingBalance.toString(),
      }));

      await createAmortizationSchedules(scheduleData);

      // อนุมัติคำขอ
      await approveLoanRequest(input.requestId, ctx.user.id);

      // สร้างการแจ้งเตือน
      await createNotification({
        userId: request.borrowerId,
        type: "loan_approved",
        message: `คำขอกู้ของคุณได้รับการอนุมัติแล้ว จำนวนเงิน ${request.amountRequested} บาท`,
        sentVia: "in-app",
      });

      return { success: true, loanId };
    }),

  /**
   * ปฏิเสธคำขอกู้ (Admin/Lender)
   */
  rejectRequest: protectedProcedure
    .input(rejectRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageLoan(ctx.user.role)) {
        throw new Error("ไม่มีสิทธิ์ปฏิเสธคำขอ");
      }

      const request = await getLoanRequestById(input.requestId);
      if (!request) throw new Error("ไม่พบคำขอกู้");

      await rejectLoanRequest(input.requestId, ctx.user.id, input.reason);

      // สร้างการแจ้งเตือน
      await createNotification({
        userId: request.borrowerId,
        type: "loan_rejected",
        message: `คำขอกู้ของคุณถูกปฏิเสธ เหตุผล: ${input.reason}`,
        sentVia: "in-app",
      });

      return { success: true };
    }),

  // ===== Loan Procedures =====

  /**
   * ดูสัญญาเงินกู้ของตัวเอง
   */
  getMyLoans: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "borrower") {
      return await getLoansByBorrower(ctx.user.id);
    } else if (ctx.user.role === "lender") {
      return await getLoansByLender(ctx.user.id);
    }
    return [];
  }),

  /**
   * ดูรายละเอียดสัญญาเงินกู้
   */
  getLoan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const loan = await getLoanById(input.id);
      if (!loan) throw new Error("ไม่พบสัญญาเงินกู้");

      // ตรวจสอบสิทธิ์
      if (
        ctx.user.id !== loan.borrowerId &&
        ctx.user.id !== loan.lenderId &&
        ctx.user.role !== "admin"
      ) {
        throw new Error("ไม่มีสิทธิ์เข้าถึง");
      }

      return loan;
    }),

  /**
   * ดูตารางผ่อนชำระ
   */
  getAmortizationSchedule: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const loan = await getLoanById(input.loanId);
      if (!loan) throw new Error("ไม่พบสัญญาเงินกู้");

      // ตรวจสอบสิทธิ์
      if (
        ctx.user.id !== loan.borrowerId &&
        ctx.user.id !== loan.lenderId &&
        ctx.user.role !== "admin"
      ) {
        throw new Error("ไม่มีสิทธิ์เข้าถึง");
      }

      return await getAmortizationSchedule(input.loanId);
    }),

  // ===== Payment Procedures =====

  /**
   * สร้าง payload สำหรับ QR พร้อมเพย์ของจำนวนเงินที่ระบุ
   */
  generatePromptPayPayload: protectedProcedure
    .input(
      z.object({
        promptPayId: z.string().regex(/^[0-9]{10,13}$/, "PromptPay ID ต้องเป็นเบอร์โทรหรือเลขบัตรประชาชน"),
        amount: z.number().positive("จำนวนเงินต้องมากกว่า 0"),
      })
    )
    .query(({ input }) => ({
      payload: generatePromptPayPayload(input.promptPayId, { amount: input.amount }),
      amount: input.amount,
    })),

  /**
   * อัปโหลดสลิปไปยัง storage และบันทึกการชำระเงินในรายการเดียว
   */
  uploadPaymentSlip: protectedProcedure
    .input(uploadPaymentSlipInputSchema)
    .mutation(async ({ ctx, input }) => {
      const loan = await getLoanById(input.loanId);
      if (!loan) throw new Error("ไม่พบสัญญาเงินกู้");
      if (ctx.user.id !== loan.borrowerId) {
        throw new Error("เฉพาะผู้กู้เท่านั้นที่สามารถอัปโหลดสลิป");
      }

      const fileBuffer = Buffer.from(input.base64, "base64");
      if (fileBuffer.length === 0 || fileBuffer.length > 5 * 1024 * 1024) {
        throw new Error("ขนาดไฟล์ต้องไม่เกิน 5 MB");
      }

      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `payment-slips/${ctx.user.id}/${input.loanId}-${Date.now()}-${safeName}`;
      const uploaded = await storagePut(storageKey, fileBuffer, input.mimeType);
      const result = await createLoanPayment({
        loanId: input.loanId,
        scheduleId: input.scheduleId,
        amountPaid: input.amountPaid.toString(),
        paymentMethod: input.paymentMethod,
        slipPath: uploaded.url,
      });

      await createNotification({
        userId: loan.lenderId,
        type: "payment_verified",
        message: `ผู้กู้อัปโหลดสลิปการชำระเงิน ${input.amountPaid} บาท รอการตรวจสอบ`,
        sentVia: "in-app",
      });

      return { success: true, storageKey: uploaded.key, slipUrl: uploaded.url, result };
    }),

  /**
   * บันทึกการชำระเงิน (upload สลิป)
   */
  recordPayment: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        amountPaid: z.number().positive(),
        paymentMethod: z.string(),
        slipPath: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const loan = await getLoanById(input.loanId);
      if (!loan) throw new Error("ไม่พบสัญญาเงินกู้");

      if (ctx.user.id !== loan.borrowerId) {
        throw new Error("เฉพาะผู้กู้เท่านั้นที่สามารถบันทึกการชำระเงิน");
      }

      const result = await createLoanPayment({
        loanId: input.loanId,
        amountPaid: input.amountPaid.toString(),
        paymentMethod: input.paymentMethod,
        slipPath: input.slipPath,
      });

      // สร้างการแจ้งเตือน
      await createNotification({
        userId: loan.lenderId,
        type: "payment_verified",
        message: `ผู้กู้ได้ชำระเงิน ${input.amountPaid} บาท รอการตรวจสอบ`,
        sentVia: "in-app",
      });

      return result;
    }),

  /**
   * ดูประวัติการชำระเงิน
   */
  getPayments: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const loan = await getLoanById(input.loanId);
      if (!loan) throw new Error("ไม่พบสัญญาเงินกู้");

      if (
        ctx.user.id !== loan.borrowerId &&
        ctx.user.id !== loan.lenderId &&
        ctx.user.role !== "admin"
      ) {
        throw new Error("ไม่มีสิทธิ์เข้าถึง");
      }

      return await getLoanPayments(input.loanId);
    }),

  /**
   * ดูการชำระเงินที่รอการตรวจสอบ (Admin/Lender)
   */
  getPendingPayments: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") {
      throw new Error("ไม่มีสิทธิ์เข้าถึง");
    }
    const payments = await getPendingPaymentVerifications();
    if (ctx.user.role === "admin") return payments;

    const scopedPayments = await Promise.all(payments.map(async (payment) => {
      const loan = await getLoanById(payment.loanId);
      return loan?.lenderId === ctx.user.id ? payment : null;
    }));
    return scopedPayments.filter((payment): payment is NonNullable<typeof payment> => payment !== null);
  }),

  /**
   * ตรวจสอบการชำระเงิน (Admin/Lender)
   */
  verifyPayment: protectedProcedure
    .input(verifyPaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageLoan(ctx.user.role)) {
        throw new Error("ไม่มีสิทธิ์ตรวจสอบการชำระเงิน");
      }

      const payment = await getPaymentById(input.paymentId);
      if (!payment) throw new Error("ไม่พบรายการชำระเงิน");
      const paymentLoan = await getLoanById(payment.loanId);
      if (!paymentLoan || (ctx.user.role === "lender" && paymentLoan.lenderId !== ctx.user.id)) {
        throw new Error("ไม่มีสิทธิ์ตรวจสอบการชำระเงินนี้");
      }

      await verifyPayment(input.paymentId, ctx.user.id);

      return { success: true };
    }),

  /**
   * ปฏิเสธการชำระเงิน (Admin/Lender)
   */
  rejectPayment: protectedProcedure
    .input(rejectPaymentInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageLoan(ctx.user.role)) {
        throw new Error("ไม่มีสิทธิ์ปฏิเสธการชำระเงิน");
      }

      const payment = await getPaymentById(input.paymentId);
      if (!payment) throw new Error("ไม่พบรายการชำระเงิน");
      const paymentLoan = await getLoanById(payment.loanId);
      if (!paymentLoan || (ctx.user.role === "lender" && paymentLoan.lenderId !== ctx.user.id)) {
        throw new Error("ไม่มีสิทธิ์ปฏิเสธการชำระเงินนี้");
      }

      await rejectPayment(input.paymentId, ctx.user.id, input.reason);

      return { success: true };
    }),

  // ===== Notification Procedures =====

  /**
   * ดูการแจ้งเตือนของตัวเอง
   */
  getNotifications: protectedProcedure.query(async ({ ctx }) => {
    return await getUserNotifications(ctx.user.id);
  }),

  /**
   * ทำเครื่องหมายการแจ้งเตือนว่าอ่านแล้ว
   */
  markAsRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationAsRead(input.notificationId, ctx.user.id);
      return { success: true };
    }),

  // ===== Admin Dashboard Procedures =====

  /**
   * ดูสถิติแดชบอร์ด Admin
   */
  getAdminDashboard: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new Error("ไม่มีสิทธิ์เข้าถึง");
    }
    return await getAdminStats();
  }),
});
