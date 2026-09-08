import { describe, expect, it } from "vitest";
import { lineNotifyRouter } from "./routers/lineNotifyRouter";

function caller(role: "borrower" | "lender" | "admin") {
  return lineNotifyRouter.createCaller({ user: { id: 41, role, openId: `${role}-41`, name: role } as any, req: {} as any, res: {} as any } as any);
}

describe("LINE operational notification authorization", () => {
  it("prevents borrowers from triggering decision and payment notifications", async () => {
    await expect(caller("borrower").sendLoanApprovalNotification({ borrowerId: 41, borrowerName: "ผู้กู้", loanAmount: "10000", monthlyPayment: "900", requestId: 1 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนอนุมัติ");
    await expect(caller("borrower").sendLoanRejectionNotification({ borrowerId: 41, borrowerName: "ผู้กู้", requestId: 1 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนปฏิเสธ");
    await expect(caller("borrower").sendPaymentPendingNotification({ borrowerId: 41, borrowerName: "ผู้กู้", amountPaid: "900", paymentDate: "2026-08-25", requestId: 1 })).rejects.toThrow("ไม่มีสิทธิ์ส่งการแจ้งเตือนการชำระเงิน");
  });
});
