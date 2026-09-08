import { describe, expect, it } from "vitest";
import { activityFilterOptions, filterActivityHistory } from "../client/src/lib/adminActivityHistoryUtils";

const records = [
  { id: "request-1", status: "approved", loanId: 11, title: "อนุมัติคำขอกู้", detail: "คำขอ #1", actorName: "ผู้ดูแล A", actorRole: "admin", lenderId: 7, lenderName: "ผู้ให้กู้ A", occurredAt: new Date("2026-08-01") },
  { id: "payment-1", status: "verified", loanId: 11, title: "ยืนยันการชำระเงิน", detail: "รายการชำระ #1", actorName: "ผู้ตรวจ B", actorRole: "lender", lenderId: 7, lenderName: "ผู้ให้กู้ A", occurredAt: new Date("2026-08-02") },
  { id: "request-2", status: "rejected", loanId: null, title: "ปฏิเสธคำขอกู้", detail: "คำขอ #2", actorName: "ผู้ดูแล A", actorRole: "admin", lenderId: null, lenderName: "ไม่ระบุผู้ให้กู้", occurredAt: new Date("2026-08-03") },
];

describe("Activity History filters", () => {
  it("filters by event type and actor name together without mutating the source", () => {
    expect(filterActivityHistory(records, "อนุมัติคำขอกู้", "ผู้ดูแล A").map((record) => record.id)).toEqual(["request-1"]);
    expect(filterActivityHistory(records, "all", "ผู้ดูแล A").map((record) => record.id)).toEqual(["request-1", "request-2"]);
    expect(records).toHaveLength(3);
  });

  it("derives unique filter choices from authorized activity records", () => {
    expect(activityFilterOptions(records)).toEqual({ eventTypes: ["อนุมัติคำขอกู้", "ยืนยันการชำระเงิน", "ปฏิเสธคำขอกู้"], actors: ["ผู้ดูแล A", "ผู้ตรวจ B"], roles: ["admin", "lender"], lenders: [{ id: 7, name: "ผู้ให้กู้ A" }] });
  });
});
