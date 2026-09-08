import { z } from "zod";

export const createLoanRequestInputSchema = z.object({
  amountRequested: z.number().positive("จำนวนเงินต้องมากกว่า 0"),
  interestRate: z.number().min(0).max(100, "อัตราดอกเบี้ยต้องอยู่ระหว่าง 0-100%"),
  loanTermMonths: z.number().int().min(1, "ระยะเวลาต้องอย่างน้อย 1 เดือน"),
  interestType: z.enum(["simple", "compound"]),
  paymentType: z.enum(["fixed", "reducing"]),
});

export const approveRequestInputSchema = z.object({ requestId: z.number().int().positive() });
export const rejectRequestInputSchema = z.object({
  requestId: z.number().int().positive(),
  reason: z.string().trim().min(1, "กรุณาระบุเหตุผล"),
});
export const uploadPaymentSlipInputSchema = z.object({
  loanId: z.number().int().positive(),
  scheduleId: z.number().int().positive().optional(),
  amountPaid: z.number().positive("จำนวนเงินต้องมากกว่า 0"),
  paymentMethod: z.enum(["promptpay", "bank_transfer", "cash"]),
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "ไฟล์สลิปไม่ถูกต้อง"),
});
export const verifyPaymentInputSchema = z.object({ paymentId: z.number().int().positive() });
export const rejectPaymentInputSchema = z.object({
  paymentId: z.number().int().positive(),
  reason: z.string().trim().min(1, "กรุณาระบุเหตุผล"),
});

export function canCreateLoanRequest(role: string | null | undefined): boolean {
  return role === "borrower";
}

export function canManageLoan(role: string | null | undefined): boolean {
  return role === "admin" || role === "lender";
}
