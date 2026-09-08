import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { loans, amortizationSchedules, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  filterAmortizationScheduleByDateRange,
  generateAmortizationCSV,
  generateCSVFilename,
} from "../csvExport";

const dateOnlyInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD")
  .optional();

const amortizationExportInput = z
  .object({
    loanId: z.number().int().positive(),
    startDate: dateOnlyInput,
    endDate: dateOnlyInput,
  })
  .superRefine((value, refinementContext) => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      refinementContext.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น",
      });
    }
  });

export const exportRouter = router({

  /**
   * Export amortization schedule as CSV
   * ผู้ใช้สามารถ export ตารางผ่อนชำระของสัญญาเงินกู้ของตนเองได้
   */
  amortizationScheduleCSV: protectedProcedure
    .input(amortizationExportInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      // Get loan details
      const loan = await db
        .select()
        .from(loans)
        .where(eq(loans.id, input.loanId))
        .limit(1);

      if (!loan || loan.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Loan not found",
        });
      }

      const loanRecord = loan[0];

      // Check authorization - user can only export their own loans or if they are lender/admin
      if (
        ctx.user.role === "borrower" &&
        loanRecord.borrowerId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to export this loan",
        });
      }

      // Get borrower name
      const borrower = await db
        .select()
        .from(users)
        .where(eq(users.id, loanRecord.borrowerId))
        .limit(1);

      const borrowerName = borrower?.[0]?.name || "Unknown";

      // Get amortization schedule
      const schedule = await db
        .select()
        .from(amortizationSchedules)
        .where(eq(amortizationSchedules.loanId, input.loanId))
        .orderBy(amortizationSchedules.paymentNumber);

      if (!schedule || schedule.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Amortization schedule not found",
        });
      }

      // Filter by due date inclusively when a range is provided.
      const filteredSchedule = filterAmortizationScheduleByDateRange(schedule, {
        startDate: input.startDate,
        endDate: input.endDate,
      });

      // Format schedule data for CSV. An empty filtered range is valid and
      // produces a CSV containing the loan metadata and column headers.
      const formattedSchedule = filteredSchedule.map((row) => ({
        paymentNumber: row.paymentNumber,
        dueDate: new Date(row.dueDate).toLocaleDateString("th-TH"),
        startingBalance: parseFloat(row.startingBalance).toLocaleString("th-TH", {
          maximumFractionDigits: 2,
        }),
        principalDue: parseFloat(row.principalDue).toLocaleString("th-TH", {
          maximumFractionDigits: 2,
        }),
        interestDue: parseFloat(row.interestDue).toLocaleString("th-TH", {
          maximumFractionDigits: 2,
        }),
        totalPayment: parseFloat(row.totalPaymentDue).toLocaleString("th-TH", {
          maximumFractionDigits: 2,
        }),
        endingBalance: parseFloat(row.endingBalance).toLocaleString("th-TH", {
          maximumFractionDigits: 2,
        }),
      }));

      // Generate CSV content
      const csvContent = generateAmortizationCSV(
        {
          loanId: loanRecord.id,
          borrowerName,
          principalAmount: parseFloat(loanRecord.principalAmount).toLocaleString(
            "th-TH",
            { maximumFractionDigits: 2 }
          ),
          interestRate: loanRecord.interestRate,
          loanTermMonths: loanRecord.loanTermMonths,
          startDate: new Date(loanRecord.startDate).toLocaleDateString("th-TH"),
          endDate: new Date(
            new Date(loanRecord.startDate).getTime() +
              loanRecord.loanTermMonths * 30 * 24 * 60 * 60 * 1000
          ).toLocaleDateString("th-TH"),
          interestType: loanRecord.interestType,
          paymentType: loanRecord.paymentType,
        },
        formattedSchedule,
        {
          startDate: input.startDate,
          endDate: input.endDate,
        }
      );

      const filename = generateCSVFilename(loanRecord.id, {
        startDate: input.startDate,
        endDate: input.endDate,
      });

      return {
        success: true,
        filename,
        csvContent,
        contentType: "text/csv;charset=utf-8;",
        rowCount: filteredSchedule.length,
        dateRange: {
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
        },
      };
    }),

  /**
   * Export multiple loans data as CSV (for admin/lender)
   * ผู้ให้กู้และแอดมินสามารถ export ข้อมูลหลายสัญญาได้
   */
  multipleLoansCSV: protectedProcedure
    .input(
      z.object({
        loanIds: z.array(z.number()),
      })
    )
    .query(async ({ ctx, input }) => {
      // Only lender and admin can export multiple loans
      if (ctx.user.role === "borrower") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only lenders and admins can export multiple loans",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const lines: string[] = [];

      // Header
      lines.push("สรุปข้อมูลสัญญาเงินกู้");
      lines.push("Loan Summary Report");
      lines.push("");
      lines.push(
        [
          "เลขที่สัญญา",
          "ชื่อผู้กู้",
          "เงินต้น",
          "อัตราดอกเบี้ย",
          "ระยะเวลา",
          "วันเริ่มต้น",
          "วันสิ้นสุด",
          "ยอดชำระแล้ว",
          "ยอดคงค้าง",
          "สถานะ",
        ].join(",")
      );

      // Get all requested loans
      for (const loanId of input.loanIds) {
        const loan = await db
          .select()
          .from(loans)
          .where(eq(loans.id, loanId))
          .limit(1);

        if (loan && loan.length > 0) {
          const loanRecord = loan[0];

          const borrower = await db
            .select()
            .from(users)
            .where(eq(users.id, loanRecord.borrowerId))
            .limit(1);

          const borrowerName = borrower?.[0]?.name || "Unknown";
          const principal = parseFloat(loanRecord.principalAmount);
          const paid = parseFloat(loanRecord.totalPaid || "0");
          const outstanding = principal - paid;

          const values = [
            loanRecord.id.toString(),
            borrowerName,
            principal.toFixed(2),
            loanRecord.interestRate,
            loanRecord.loanTermMonths.toString(),
            new Date(loanRecord.startDate).toLocaleDateString("th-TH"),
            new Date(
              new Date(loanRecord.startDate).getTime() +
                loanRecord.loanTermMonths * 30 * 24 * 60 * 60 * 1000
            ).toLocaleDateString("th-TH"),
            paid.toFixed(2),
            outstanding.toFixed(2),
            loanRecord.isClosed ? "ปิดแล้ว" : "กำลังดำเนิน",
          ];

          lines.push(values.join(","));
        }
      }

      const csvContent = lines.join("\n");
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const filename = `loans_summary_${dateStr}.csv`;

      return {
        success: true,
        filename,
        csvContent,
        contentType: "text/csv;charset=utf-8;",
      };
    }),
});
