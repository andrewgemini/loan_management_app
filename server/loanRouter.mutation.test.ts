import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  createLoanRequest: vi.fn(),
  getLoanRequestById: vi.fn(),
  getLoanRequestsByBorrower: vi.fn(),
  getPendingLoanRequests: vi.fn(),
  approveLoanRequest: vi.fn(),
  rejectLoanRequest: vi.fn(),
  createLoan: vi.fn(),
  getLoanById: vi.fn(),
  getLoansByBorrower: vi.fn(),
  getLoansByLender: vi.fn(),
  createAmortizationSchedules: vi.fn(),
  getAmortizationSchedule: vi.fn(),
  createLoanPayment: vi.fn(),
  getLoanPayments: vi.fn(),
  getPendingPaymentVerifications: vi.fn(),
  getPaymentById: vi.fn(),
  verifyPayment: vi.fn(),
  rejectPayment: vi.fn(),
  createNotification: vi.fn(),
  getUserNotifications: vi.fn(),
  markNotificationAsRead: vi.fn(),
  getAdminStats: vi.fn(),
}));
const storageMock = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("./db", () => dbMock);
vi.mock("./storage", () => storageMock);

import { loanRouter } from "./routers/loanRouter";

const request = {
  id: 9,
  borrowerId: 11,
  amountRequested: "12000.00",
  interestRate: "12.00",
  loanTermMonths: 6,
  interestType: "simple" as const,
  paymentType: "reducing" as const,
};
const loan = {
  id: 77,
  requestId: 9,
  borrowerId: 11,
  lenderId: 22,
  principalAmount: "12000.00",
  totalPaid: "0.00",
  isClosed: false,
};

function caller(role: "admin" | "lender" | "borrower", id: number) {
  return loanRouter.createCaller({
    user: { id, role, name: role, openId: `${role}-test` } as any,
    req: {} as any,
    res: {} as any,
  } as any);
}

describe("loanRouter mutation workflows", () => {
  beforeEach(() => {
    Object.values(dbMock).forEach((mock) => mock.mockReset());
    Object.values(storageMock).forEach((mock) => mock.mockReset());
    dbMock.getLoanRequestById.mockResolvedValue(request);
    dbMock.getLoanById.mockResolvedValue(loan);
    dbMock.getPaymentById.mockResolvedValue({ id: 501, loanId: 77 });
    dbMock.createLoan.mockResolvedValue({ insertId: 77 });
    dbMock.createAmortizationSchedules.mockResolvedValue(undefined);
    dbMock.approveLoanRequest.mockResolvedValue(undefined);
    dbMock.rejectLoanRequest.mockResolvedValue(undefined);
    dbMock.createNotification.mockResolvedValue(undefined);
    dbMock.createLoanPayment.mockResolvedValue({ insertId: 501 });
    dbMock.verifyPayment.mockResolvedValue(undefined);
    dbMock.rejectPayment.mockResolvedValue(undefined);
    storageMock.storagePut.mockResolvedValue({ key: "payment-slips/test/slip.png", url: "https://storage.test/slip.png" });
  });

  it("approves a loan by creating the contract, schedule, and notification", async () => {
    const result = await caller("admin", 1).approveRequest({ requestId: 9 });

    expect(result).toEqual({ success: true, loanId: 77 });
    expect(dbMock.createLoan).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 9,
      borrowerId: 11,
      lenderId: 1,
    }));
    expect(dbMock.createAmortizationSchedules).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ loanId: 77, paymentNumber: 1 }),
    ]));
    expect(dbMock.approveLoanRequest).toHaveBeenCalledWith(9, 1);
    expect(dbMock.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11,
      type: "loan_approved",
    }));
  });

  it("rejects a loan request with a reason and protects borrower permissions", async () => {
    await expect(caller("borrower", 11).approveRequest({ requestId: 9 })).rejects.toThrow("ไม่มีสิทธิ์อนุมัติคำขอ");
    const result = await caller("lender", 22).rejectRequest({ requestId: 9, reason: "เอกสารไม่ครบ" });

    expect(result).toEqual({ success: true });
    expect(dbMock.rejectLoanRequest).toHaveBeenCalledWith(9, 22, "เอกสารไม่ครบ");
    expect(dbMock.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "loan_rejected" }));
  });

  it("allows a borrower to open only the borrower's own request", async () => {
    await expect(caller("borrower", 11).getRequest({ id: 9 })).resolves.toEqual(request);
    await expect(caller("borrower", 12).getRequest({ id: 9 })).rejects.toThrow("ไม่มีสิทธิ์เข้าถึงคำขอนี้");
  });

  it("uploads a validated slip only for the borrower and records the payment", async () => {
    const result = await caller("borrower", 11).uploadPaymentSlip({
      loanId: 77,
      scheduleId: 4,
      amountPaid: 2500,
      paymentMethod: "promptpay",
      fileName: "slip.png",
      mimeType: "image/png",
      base64: "aGVsbG8=",
    });

    expect(result).toEqual(expect.objectContaining({ success: true, slipUrl: "https://storage.test/slip.png" }));
    expect(storageMock.storagePut).toHaveBeenCalledWith(expect.stringContaining("payment-slips/11/77-"), expect.any(Buffer), "image/png");
    expect(dbMock.createLoanPayment).toHaveBeenCalledWith(expect.objectContaining({
      loanId: 77,
      scheduleId: 4,
      amountPaid: "2500",
      slipPath: "https://storage.test/slip.png",
    }));
    await expect(caller("lender", 22).uploadPaymentSlip({
      loanId: 77,
      amountPaid: 2500,
      paymentMethod: "promptpay",
      fileName: "slip.png",
      mimeType: "image/png",
      base64: "aGVsbG8=",
    })).rejects.toThrow("เฉพาะผู้กู้เท่านั้นที่สามารถอัปโหลดสลิป");
  });

  it("protects payment verification and calls verify/reject workflows for managers", async () => {
    await expect(caller("borrower", 11).verifyPayment({ paymentId: 501 })).rejects.toThrow("ไม่มีสิทธิ์ตรวจสอบการชำระเงิน");
    expect(await caller("admin", 1).verifyPayment({ paymentId: 501 })).toEqual({ success: true });
    expect(await caller("lender", 22).rejectPayment({ paymentId: 501, reason: "ยอดไม่ตรงสลิป" })).toEqual({ success: true });
    expect(dbMock.verifyPayment).toHaveBeenCalledWith(501, 1);
    expect(dbMock.rejectPayment).toHaveBeenCalledWith(501, 22, "ยอดไม่ตรงสลิป");
  });

  it("prevents a lender from deciding a payment for another lender's contract", async () => {
    dbMock.getLoanById.mockResolvedValue({ ...loan, lenderId: 99 });
    await expect(caller("lender", 22).verifyPayment({ paymentId: 501 })).rejects.toThrow("ไม่มีสิทธิ์ตรวจสอบการชำระเงินนี้");
    await expect(caller("lender", 22).rejectPayment({ paymentId: 501, reason: "ไม่ใช่สัญญาของผู้ให้กู้" })).rejects.toThrow("ไม่มีสิทธิ์ปฏิเสธการชำระเงินนี้");
  });

  it("marks a notification as read only through the current user identity", async () => {
    dbMock.markNotificationAsRead.mockResolvedValue(undefined);
    await expect(caller("borrower", 11).markAsRead({ notificationId: 72 })).resolves.toEqual({ success: true });
    expect(dbMock.markNotificationAsRead).toHaveBeenCalledWith(72, 11);
  });

  it("scopes pending payments to the active lender's contracts", async () => {
    dbMock.getPendingPaymentVerifications.mockResolvedValue([{ id: 501, loanId: 77 }, { id: 502, loanId: 88 }]);
    dbMock.getLoanById.mockImplementation(async (loanId: number) => loanId === 77 ? loan : { ...loan, id: 88, lenderId: 99 });
    await expect(caller("lender", 22).getPendingPayments()).resolves.toEqual([{ id: 501, loanId: 77 }]);
    await expect(caller("admin", 1).getPendingPayments()).resolves.toEqual([{ id: 501, loanId: 77 }, { id: 502, loanId: 88 }]);
  });
});
