import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ selectResults: [] as unknown[][] }));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn(() => {
      const result = state.selectResults.shift() ?? [];
      const chain = { from: () => chain, where: () => chain, limit: async () => result, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve) };
      return chain;
    }),
  })),
}));

vi.mock("./emailService", () => ({
  sendEmail: vi.fn(),
  getNewLoanRequestEmailTemplate: vi.fn(() => "template"),
  getLoanRequestConfirmationEmailTemplate: vi.fn(() => "template"),
  getLoanApprovalEmailTemplate: vi.fn(() => "template"),
}));

vi.mock("./notificationPreferencesDb", () => ({
  shouldSendEmailLoanApproval: vi.fn(),
  shouldSendEmailLoanRejection: vi.fn(),
  shouldSendEmailNewLoanRequest: vi.fn(async () => true),
}));

import { notificationRouter } from "./routers/notificationRouter";

function caller(role: "borrower" | "lender" | "admin", id = 41) {
  return notificationRouter.createCaller({ user: { id, role, openId: `${role}-${id}`, name: role } as any, req: {} as any, res: {} as any } as any);
}

describe("Email operational notification authorization", () => {
  beforeEach(() => { state.selectResults = []; });

  it("allows a borrower to notify only on an owned request", async () => {
    state.selectResults = [
      [{ borrowerId: 41, amountRequested: "10000.00", interestRate: "5.00", loanTermMonths: 12 }],
      [{ id: 41, name: "ผู้กู้", email: "borrower@example.test" }],
      [],
      [],
    ];
    await expect(caller("borrower").sendNewLoanRequestNotification({ requestId: 1 })).resolves.toEqual({ success: true });
  });

  it("rejects cross-account new-request notifications and lenders", async () => {
    state.selectResults = [[{ borrowerId: 9, amountRequested: "10000.00", interestRate: "5.00", loanTermMonths: 12 }]];
    await expect(caller("borrower").sendNewLoanRequestNotification({ requestId: 1 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอนี้");
    await expect(caller("lender").sendNewLoanRequestNotification({ requestId: 1 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอกู้");
  });

  it("prevents borrowers from triggering decision emails", async () => {
    await expect(caller("borrower").sendLoanApprovalNotification({ requestId: 1, borrowerId: 41, loanAmount: "10000", interestRate: "5", loanTermMonths: 12, monthlyPayment: "900" })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนอนุมัติ");
    await expect(caller("borrower").sendLoanRejectionNotification({ requestId: 1, borrowerId: 41 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนปฏิเสธ");
  });
});
