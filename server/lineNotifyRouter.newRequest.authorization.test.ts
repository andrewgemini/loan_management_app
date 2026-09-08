import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  sendNewLoanRequest: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn(() => {
      const result = state.selectResults.shift() ?? [];
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: async () => result,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    }),
  })),
}));

vi.mock("./lineNotifyService", () => ({
  sendLineNotify: vi.fn(),
  verifyLineNotifyToken: vi.fn(),
  revokeLineNotifyToken: vi.fn(),
  sendNewLoanRequestLineNotification: state.sendNewLoanRequest,
  sendLoanApprovalLineNotification: vi.fn(),
  sendLoanRejectionLineNotification: vi.fn(),
  sendPaymentPendingLineNotification: vi.fn(),
}));

vi.mock("./notificationPreferencesDb", () => ({
  shouldSendLineLoanApproval: vi.fn(),
  shouldSendLineLoanRejection: vi.fn(),
  shouldSendLineNewLoanRequest: vi.fn(async () => true),
  shouldSendLinePaymentReminder: vi.fn(),
  recordNotificationPreferenceAudit: vi.fn(),
}));

import { lineNotifyRouter } from "./routers/lineNotifyRouter";

function caller(role: "borrower" | "lender" | "admin", id = 41) {
  return lineNotifyRouter.createCaller({ user: { id, role, openId: `${role}-${id}`, name: role } as any, req: {} as any, res: {} as any } as any);
}

describe("LINE new-request notification authorization", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.sendNewLoanRequest.mockReset();
  });

  it("allows a borrower only for an owned request and reads loan values from the database", async () => {
    state.selectResults = [
      [{ borrowerId: 41, amountRequested: "10000.00", interestRate: "5.00", loanTermMonths: 12 }],
      [{ name: "ผู้กู้ตัวอย่าง" }],
      [],
    ];
    await expect(caller("borrower").sendNewLoanRequestNotification({ requestId: 9 })).resolves.toEqual({ success: true });
  });

  it("rejects a borrower attempting to notify on another account's request", async () => {
    state.selectResults = [[{ borrowerId: 99, amountRequested: "10000.00", interestRate: "5.00", loanTermMonths: 12 }]];
    await expect(caller("borrower").sendNewLoanRequestNotification({ requestId: 9 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอนี้");
  });

  it("rejects lenders and rejects client fields outside the requestId contract", async () => {
    await expect(caller("lender").sendNewLoanRequestNotification({ requestId: 9 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนคำขอกู้");
    await expect(caller("borrower").sendNewLoanRequestNotification({ requestId: 9, borrowerName: "ปลอม" } as any)).rejects.toThrow();
  });
});
