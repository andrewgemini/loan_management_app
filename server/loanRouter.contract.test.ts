import { describe, expect, it } from "vitest";
import {
  approveRequestInputSchema,
  canCreateLoanRequest,
  canManageLoan,
  createLoanRequestInputSchema,
  rejectPaymentInputSchema,
  rejectRequestInputSchema,
  uploadPaymentSlipInputSchema,
  verifyPaymentInputSchema,
} from "./loanContracts";

describe("loan router input contracts", () => {
  it("accepts a valid loan request and rejects invalid values", () => {
    const valid = createLoanRequestInputSchema.safeParse({
      amountRequested: 50000,
      interestRate: 12,
      loanTermMonths: 12,
      interestType: "simple",
      paymentType: "reducing",
    });
    const invalid = createLoanRequestInputSchema.safeParse({
      amountRequested: 0,
      interestRate: 120,
      loanTermMonths: 0,
      interestType: "unknown",
      paymentType: "reducing",
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("accepts approval/rejection decisions and requires a reason for rejection", () => {
    expect(approveRequestInputSchema.safeParse({ requestId: 10 }).success).toBe(true);
    expect(approveRequestInputSchema.safeParse({ requestId: 0 }).success).toBe(false);
    expect(rejectRequestInputSchema.safeParse({ requestId: 10, reason: "เอกสารไม่ครบ" }).success).toBe(true);
    expect(rejectRequestInputSchema.safeParse({ requestId: 10, reason: "   " }).success).toBe(false);
  });

  it("validates payment upload and verification contracts", () => {
    expect(uploadPaymentSlipInputSchema.safeParse({
      loanId: 2,
      amountPaid: 2500,
      paymentMethod: "promptpay",
      fileName: "slip.png",
      mimeType: "image/png",
      base64: "aGVsbG8=",
    }).success).toBe(true);
    expect(uploadPaymentSlipInputSchema.safeParse({
      loanId: 2,
      amountPaid: -1,
      paymentMethod: "promptpay",
      fileName: "slip.exe",
      mimeType: "application/octet-stream",
      base64: "not valid",
    }).success).toBe(false);
    expect(verifyPaymentInputSchema.safeParse({ paymentId: 1 }).success).toBe(true);
    expect(rejectPaymentInputSchema.safeParse({ paymentId: 1, reason: "สลิปไม่ชัดเจน" }).success).toBe(true);
    expect(rejectPaymentInputSchema.safeParse({ paymentId: 1, reason: "" }).success).toBe(false);
  });

  it("enforces borrower and manager role boundaries", () => {
    expect(canCreateLoanRequest("borrower")).toBe(true);
    expect(canCreateLoanRequest("lender")).toBe(false);
    expect(canCreateLoanRequest("admin")).toBe(false);
    expect(canManageLoan("admin")).toBe(true);
    expect(canManageLoan("lender")).toBe(true);
    expect(canManageLoan("borrower")).toBe(false);
  });
});
